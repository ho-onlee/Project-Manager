from django.urls import reverse
import base64
import json
from unittest.mock import patch

from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase as DRFAPITestCase

from .gemini import GeminiConfigurationError, GeminiGenerationError, GeminiInputTooLargeError, generate_project_report, project_report_fingerprint, test_gemini_api_key
from .models import AccountProfile, Project, ProjectGroup, ProjectGroupItem, ProjectNode, Skill, Tool, Workspace, WorkspaceCardAssignment, WorkspaceMembership


class APITestCase(DRFAPITestCase):
	def _pre_setup(self):
		super()._pre_setup()
		self.user = get_user_model().objects.create_user(username='test-user', email='test@example.com', password='Test-password-8492!')
		self.workspace = Workspace.objects.create(name='Test personal', workspace_type=Workspace.PERSONAL, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=self.workspace, user=self.user, role=WorkspaceMembership.OWNER)
		self.client.force_authenticate(user=self.user)


class ToolSkillAPITests(APITestCase):
	def setUp(self):
		self.skills_url = reverse('skill-list')
		self.tools_url = reverse('tool-list')
		self.skill_a = Skill.objects.create(workspace=self.workspace, name='Interviewing', description='Asks useful questions.')
		self.skill_b = Skill.objects.create(workspace=self.workspace, name='Thematic coding', description='Groups recurring ideas.')

	def test_tool_can_be_created_with_multiple_skills(self):
		response = self.client.post(self.tools_url, {
			'name': 'Interview kit',
			'description': 'A research device.',
			'features': ['Prompts', 'Notes'],
			'skillIds': [str(self.skill_a.id), str(self.skill_b.id)],
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		tool = Tool.objects.get(id=response.data['id'])
		self.assertCountEqual([str(skill_id) for skill_id in response.data['skillIds']], [str(self.skill_a.id), str(self.skill_b.id)])
		self.assertCountEqual(tool.skills.values_list('id', flat=True), [self.skill_a.id, self.skill_b.id])

	def test_tool_requires_at_least_one_skill(self):
		response = self.client.post(self.tools_url, {'name': 'Orphan tool', 'skillIds': []}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('skillIds', response.data)

	def test_skill_cannot_be_deleted_when_it_is_a_tools_only_skill(self):
		tool = Tool.objects.create(workspace=self.workspace, name='Single skill tool')
		tool.skills.add(self.skill_a)

		response = self.client.delete(reverse('skill-detail', args=[self.skill_a.id]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(Skill.objects.filter(id=self.skill_a.id).exists())

	def test_tool_update_replaces_skill_relationships(self):
		tool = Tool.objects.create(workspace=self.workspace, name='Research tool')
		tool.skills.add(self.skill_a, self.skill_b)

		response = self.client.patch(reverse('tool-detail', args=[tool.id]), {
			'skillIds': [str(self.skill_b.id)],
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(list(Tool.objects.get(id=tool.id).skills.values_list('id', flat=True)), [self.skill_b.id])


class ProjectReportGenerationTests(APITestCase):
	def setUp(self):
		self.project = Project.objects.create(workspace=self.workspace, title='Recipe planner', description='Plan weekly meals.')
		self.node = ProjectNode.objects.create(project=self.project, title='Collect recipes', node_type='step')
		self.url = reverse('project-generate-report', args=[self.project.id])
		self.project_json = {
			'project': {'id': str(self.project.id), 'title': self.project.title, 'description': self.project.description},
			'nodes': [{'id': str(self.node.id), 'title': 'Collect recipes', 'type': 'step'}],
			'relationships': [],
		}

	@patch('api.views.generate_project_report', return_value='# Recipe planner report')
	def test_generate_report_passes_exported_project_json(self, generate_report):
		response = self.client.post(self.url, {'project_json': self.project_json, 'prompt': 'Focus on meal planning.'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data, {'report': '# Recipe planner report', 'cached': False})
		self.assertEqual(generate_report.call_args.args[0], self.project_json)
		self.assertEqual(generate_report.call_args.args[1], 'Focus on meal planning.')

	@patch('api.views.generate_project_report', return_value='# Recipe planner report')
	def test_generated_report_is_reused_until_project_is_updated(self, generate_report):
		first_response = self.client.post(self.url, {'project_json': self.project_json}, format='json')
		cached_response = self.client.post(self.url, {'project_json': self.project_json}, format='json')

		self.assertFalse(first_response.data['cached'])
		self.assertTrue(cached_response.data['cached'])
		self.assertEqual(generate_report.call_count, 1)

		self.client.patch(reverse('project-detail', args=[self.project.id]), {'title': 'Updated planner'}, format='json')
		updated_json = {
			**self.project_json,
			'project': {**self.project_json['project'], 'title': 'Updated planner'},
		}
		updated_response = self.client.post(self.url, {'project_json': updated_json}, format='json')

		self.assertFalse(updated_response.data['cached'])
		self.assertEqual(generate_report.call_count, 2)

	def test_generate_report_rejects_json_for_another_project(self):
		project_json = {**self.project_json, 'project': {'id': 'another-project'}}
		response = self.client.post(self.url, {'project_json': project_json}, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	@patch('api.views.generate_project_report', side_effect=GeminiConfigurationError('Missing API key.'))
	def test_generate_report_reports_missing_server_api_key(self, generate_report):
		response = self.client.post(self.url, {'project_json': self.project_json}, format='json')

		self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
		self.assertEqual(response.data['detail'], 'Missing API key.')

	@patch('api.views.generate_project_report', side_effect=GeminiInputTooLargeError('Project is too large.'))
	def test_generate_report_rejects_oversized_project_text(self, generate_report):
		response = self.client.post(self.url, {'project_json': self.project_json}, format='json')

		self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
		self.assertEqual(response.data['detail'], 'Project is too large.')


class ProjectNodeOrderingTests(APITestCase):
	def setUp(self):
		self.project = Project.objects.create(workspace=self.workspace, title='Ordered flow')
		self.root = ProjectNode.objects.create(project=self.project, title='Ordered flow', node_type='project', is_project_root=True, order=0)
		self.first_node = ProjectNode.objects.create(project=self.project, title='First', order=1)
		self.second_node = ProjectNode.objects.create(project=self.project, title='Second', order=2)

	def test_node_order_is_serialized_and_can_share_a_rank(self):
		response = self.client.patch(
			reverse('projectnode-detail', args=[self.second_node.id]),
			{'order': 1},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['order'], 1)
		self.second_node.refresh_from_db()
		self.assertEqual(self.second_node.order, self.first_node.order)

	def test_project_root_order_is_included_in_project_json(self):
		response = self.client.get(reverse('project-detail', args=[self.project.id]))

		root_json = next(node for node in response.data['nodes'] if node['is_project_root'])
		self.assertEqual(root_json['order'], 0)


class ProjectGroupAPITests(APITestCase):
	def setUp(self):
		self.project = Project.objects.create(workspace=self.workspace, title='Field survey', description='Collect observations.')
		self.group = ProjectGroup.objects.create(workspace=self.workspace, title='Research program', description='Projects for the field study.')

	def test_group_canvas_can_store_project_text_and_shape_items(self):
		group_item_url = reverse('projectgroupitem-list')
		project_item = self.client.post(group_item_url, {
			'group': str(self.group.id), 'project': str(self.project.id), 'item_type': 'project', 'x': 120, 'y': 160,
		}, format='json')
		text_item = self.client.post(group_item_url, {
			'group': str(self.group.id), 'item_type': 'text', 'title': 'Field note', 'content': 'Compare observations across sites.', 'x': 30, 'y': 40,
		}, format='json')
		shape_item = self.client.post(group_item_url, {
			'group': str(self.group.id), 'item_type': 'shape', 'shape_type': 'circle', 'title': 'Phase one', 'x': 80, 'y': 90, 'width': 240, 'height': 180,
		}, format='json')

		self.assertEqual(project_item.status_code, status.HTTP_201_CREATED)
		self.assertEqual(text_item.status_code, status.HTTP_201_CREATED)
		self.assertEqual(shape_item.status_code, status.HTTP_201_CREATED)
		self.assertEqual(shape_item.data['shape_type'], 'circle')

		group_response = self.client.get(reverse('projectgroup-detail', args=[self.group.id]))
		self.assertEqual(group_response.status_code, status.HTTP_200_OK)
		self.assertEqual(group_response.data['item_count'], 3)
		self.assertEqual(next(item for item in group_response.data['items'] if item['item_type'] == 'project')['projectTitle'], 'Field survey')

	def test_shape_annotation_requires_a_supported_shape(self):
		response = self.client.post(reverse('projectgroupitem-list'), {
			'group': str(self.group.id), 'item_type': 'shape', 'shape_type': 'star',
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_project_canvas_item_requires_a_project(self):
		response = self.client.post(reverse('projectgroupitem-list'), {
			'group': str(self.group.id), 'item_type': 'project',
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_group_items_can_be_connected_but_cross_group_links_are_rejected(self):
		item_url = reverse('projectgroupitem-list')
		source = self.client.post(item_url, {'group': str(self.group.id), 'item_type': 'text', 'title': 'Start'}, format='json')
		target = self.client.post(item_url, {'group': str(self.group.id), 'item_type': 'shape', 'shape_type': 'rectangle'}, format='json')
		other_group = ProjectGroup.objects.create(workspace=self.workspace, title='Other group')
		other_item = self.client.post(item_url, {'group': str(other_group.id), 'item_type': 'text'}, format='json')
		connection_url = reverse('projectgrouprelationship-list')

		valid = self.client.post(connection_url, {
			'group': str(self.group.id), 'source': source.data['id'], 'target': target.data['id'],
		}, format='json')
		cross_group = self.client.post(connection_url, {
			'group': str(self.group.id), 'source': source.data['id'], 'target': other_item.data['id'],
		}, format='json')
		self_connection = self.client.post(connection_url, {
			'group': str(self.group.id), 'source': source.data['id'], 'target': source.data['id'],
		}, format='json')

		self.assertEqual(valid.status_code, status.HTTP_201_CREATED)
		self.assertEqual(valid.data['relationship_type'], 'directional')
		self.assertEqual(cross_group.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(self_connection.status_code, status.HTTP_400_BAD_REQUEST)
		updated = self.client.patch(reverse('projectgrouprelationship-detail', args=[valid.data['id']]), {
			'relationship_type': 'loose',
		}, format='json')
		self.assertEqual(updated.status_code, status.HTTP_200_OK)
		self.assertEqual(updated.data['relationship_type'], 'loose')
		group_response = self.client.get(reverse('projectgroup-detail', args=[self.group.id]))
		self.assertEqual(group_response.data['relationships'][0]['relationship_type'], 'loose')


class GeminiSettingsTests(APITestCase):
	def test_settings_status_never_returns_api_key(self):
		with patch('api.views.get_gemini_key_source', return_value='Windows Credential Manager'), patch('api.views.is_gemini_api_key_validated', return_value=False):
			response = self.client.get(reverse('gemini-settings'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertTrue(response.data['configured'])
		self.assertFalse(response.data['validated'])
		self.assertNotIn('api_key', response.data)

	@patch('api.views.is_gemini_api_key_validated', return_value=False)
	@patch('api.views.store_gemini_api_key')
	def test_settings_saves_key_to_operating_system_credential_store(self, store_key, is_validated):
		response = self.client.post(reverse('gemini-settings'), {'api_key': 'test-gemini-api-key-value'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		store_key.assert_called_once_with('test-gemini-api-key-value', workspace_id=self.workspace.id)

	@patch('api.views.test_gemini_api_key')
	@patch('api.views.mark_gemini_api_key_validated')
	@patch('api.views.gemini_settings_payload', return_value={'configured': True, 'validated': True, 'model': 'gemini-test', 'source': 'Windows Credential Manager'})
	def test_key_test_marks_api_key_verified_only_after_provider_success(self, settings_payload, mark_validated, test_key):
		response = self.client.post(reverse('gemini-settings-test'), {}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertTrue(response.data['validated'])
		test_key.assert_called_once_with(workspace_id=self.workspace.id)
		mark_validated.assert_called_once_with(workspace_id=self.workspace.id)

	@patch('api.views.clear_gemini_api_key_validation')
	@patch('api.views.test_gemini_api_key', side_effect=GeminiGenerationError('Quota exceeded.'))
	def test_failed_key_test_clears_verified_status(self, test_key, clear_validation):
		response = self.client.post(reverse('gemini-settings-test'), {}, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		clear_validation.assert_called_once_with(workspace_id=self.workspace.id)


class AccountAndWorkspaceTests(DRFAPITestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username='account-test', email='account-test@example.com', password='Test-password-8492!')
		self.workspace = Workspace.objects.create(name='Account test personal', workspace_type=Workspace.PERSONAL, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=self.workspace, user=self.user, role=WorkspaceMembership.OWNER)
		self.client.force_authenticate(user=self.user)

	def test_registration_creates_personal_workspace_and_pending_team_request(self):
		team = Workspace.objects.create(name='Research team', workspace_type=Workspace.TEAM)
		response = self.client.post(reverse('auth-register'), {
			'email': 'new-user@example.com',
			'name': 'New User',
			'password': 'M0re-Secure!Account-954',
			'teamId': str(team.id),
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertTrue(response.data['registered'])
		membership = WorkspaceMembership.objects.get(workspace=team, user__email='new-user@example.com')
		self.assertEqual(membership.status, WorkspaceMembership.PENDING)
		profile = AccountProfile.objects.get(user__email='new-user@example.com')
		self.assertTrue(profile.email_verified)

	def test_regular_account_can_create_a_team_and_becomes_owner(self):
		response = self.client.post(reverse('workspace-list'), {'name': 'Field research'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		team = Workspace.objects.get(id=response.data['id'])
		self.assertEqual(team.workspace_type, Workspace.TEAM)
		self.assertEqual(team.created_by, self.user)
		self.assertTrue(WorkspaceMembership.objects.filter(workspace=team, user=self.user, role=WorkspaceMembership.OWNER, status=WorkspaceMembership.ACTIVE).exists())

	def test_existing_account_can_request_team_access_idempotently(self):
		team = Workspace.objects.create(name='Open directory team', workspace_type=Workspace.TEAM)
		url = reverse('workspace-request-access', args=[team.id])

		first_response = self.client.post(url, {}, format='json')
		second_response = self.client.post(url, {}, format='json')

		self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(second_response.status_code, status.HTTP_200_OK)
		self.assertEqual(first_response.data['status'], WorkspaceMembership.PENDING)
		self.assertEqual(WorkspaceMembership.objects.filter(workspace=team, user=self.user).count(), 1)

	@override_settings(GOOGLE_OAUTH_CLIENT_ID='test-google-client')
	@patch('api.views.verify_google_identity', return_value={'email': 'linked@example.com', 'email_verified': True, 'given_name': 'Linked'})
	def test_google_verified_email_links_to_existing_account(self, verify_token):
		user = get_user_model().objects.create_user(username='linked@example.com', email='linked@example.com', password='M0re-Secure!Account-954')
		AccountProfile.objects.create(user=user, email_verified=False)
		workspace = Workspace.objects.create(name='Personal', workspace_type=Workspace.PERSONAL, created_by=user)
		WorkspaceMembership.objects.create(workspace=workspace, user=user, role=WorkspaceMembership.OWNER)

		response = self.client.post(reverse('auth-google'), {'credential': 'signed-google-token'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertEqual(get_user_model().objects.filter(email='linked@example.com').count(), 1)
		self.assertTrue(AccountProfile.objects.get(user=user).email_verified)
		verify_token.assert_called_once()

	@override_settings(GOOGLE_OAUTH_CLIENT_ID='test-google-client')
	@patch('api.views.verify_google_identity', return_value={'email': 'google-team@example.com', 'email_verified': True, 'given_name': 'Google'})
	def test_google_signup_can_request_team_membership(self, verify_token):
		team = Workspace.objects.create(name='Google request team', workspace_type=Workspace.TEAM)
		response = self.client.post(reverse('auth-google'), {'credential': 'signed-google-token', 'teamId': str(team.id)}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertEqual(response.data['pendingTeams'][0]['id'], str(team.id))
		self.assertEqual(WorkspaceMembership.objects.get(workspace=team).status, WorkspaceMembership.PENDING)

	def test_team_admin_can_approve_pending_member_and_add_existing_account(self):
		team = Workspace.objects.create(name='Approvals', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		pending_user = get_user_model().objects.create_user(username='pending', email='pending@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=pending_user, role=WorkspaceMembership.MEMBER, status=WorkspaceMembership.PENDING)
		approve = self.client.post(reverse('workspace-members', args=[team.id]), {'userId': str(pending_user.id)}, format='json')
		self.assertEqual(approve.status_code, status.HTTP_200_OK)
		pending_user.refresh_from_db()
		self.assertEqual(WorkspaceMembership.objects.get(workspace=team, user=pending_user).status, WorkspaceMembership.ACTIVE)

		existing_user = get_user_model().objects.create_user(username='existing', email='existing@example.com', password='Test-password-8492!')
		add = self.client.post(reverse('workspace-members', args=[team.id]), {'userId': str(existing_user.id)}, format='json')
		self.assertEqual(add.status_code, status.HTTP_201_CREATED)
		self.assertEqual(WorkspaceMembership.objects.get(workspace=team, user=existing_user).status, WorkspaceMembership.ACTIVE)

	def test_team_member_cannot_manage_members(self):
		team = Workspace.objects.create(name='Restricted', workspace_type=Workspace.TEAM, created_by=self.user)
		member = get_user_model().objects.create_user(username='regular-member', email='regular@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)
		self.client.force_authenticate(user=member)
		response = self.client.get(reverse('workspace-members', args=[team.id]))
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	@patch('api.views.delete_gemini_api_key')
	def test_team_owner_can_delete_team_owned_data_and_shared_access(self, delete_gemini_key):
		team = Workspace.objects.create(name='Disposable team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		owned_project = Project.objects.create(workspace=team, title='Team-owned project')
		personal_project = Project.objects.create(workspace=self.workspace, title='Personal project')
		personal_project.shared_with.add(team)

		response = self.client.delete(reverse('workspace-detail', args=[team.id]))

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertFalse(Workspace.objects.filter(id=team.id).exists())
		self.assertFalse(Project.objects.filter(id=owned_project.id).exists())
		personal_project.refresh_from_db()
		self.assertFalse(personal_project.shared_with.exists())
		delete_gemini_key.assert_called_once_with(workspace_id=team.id)

	@patch('api.views.delete_gemini_api_key')
	def test_team_member_cannot_delete_team(self, delete_gemini_key):
		team = Workspace.objects.create(name='Protected team', workspace_type=Workspace.TEAM, created_by=self.user)
		member = get_user_model().objects.create_user(username='delete-member', email='delete-member@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)
		self.client.force_authenticate(user=member)

		response = self.client.delete(reverse('workspace-detail', args=[team.id]))

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
		self.assertTrue(Workspace.objects.filter(id=team.id).exists())
		delete_gemini_key.assert_not_called()

	def test_team_admin_can_assign_active_members_to_visible_project(self):
		team = Workspace.objects.create(name='Assignment team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		project = Project.objects.create(workspace=self.workspace, title='Shared live project')
		project.shared_with.add(team)
		member = get_user_model().objects.create_user(username='assignee', email='assignee@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)
		url = reverse('workspace-card-assignments', args=[team.id, 'projects', project.id])

		response = self.client.put(url, {'userIds': [str(member.id)]}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['userIds'], [str(member.id)])
		self.assertTrue(WorkspaceCardAssignment.objects.filter(workspace=team, user=member, object_id=project.id).exists())

	def test_only_team_admins_can_assign_and_assignees_must_be_active_members(self):
		team = Workspace.objects.create(name='Restricted assignment team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		project = Project.objects.create(workspace=self.workspace, title='Shared project')
		project.shared_with.add(team)
		outside_user = get_user_model().objects.create_user(username='outside', email='outside@example.com', password='Test-password-8492!')
		url = reverse('workspace-card-assignments', args=[team.id, 'projects', project.id])

		invalid_assignment = self.client.put(url, {'userIds': [str(outside_user.id)]}, format='json')
		self.assertEqual(invalid_assignment.status_code, status.HTTP_400_BAD_REQUEST)

		member = get_user_model().objects.create_user(username='member', email='member@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)
		self.client.force_authenticate(user=member)
		forbidden_assignment = self.client.put(url, {'userIds': [str(member.id)]}, format='json')
		self.assertEqual(forbidden_assignment.status_code, status.HTTP_403_FORBIDDEN)

	def test_email_login_returns_the_personal_workspace(self):
		user = get_user_model().objects.create_user(username='sign-in@example.com', email='sign-in@example.com', password='M0re-Secure!Account-954')
		AccountProfile.objects.create(user=user, email_verified=True)
		workspace = Workspace.objects.create(name='Personal', workspace_type=Workspace.PERSONAL, created_by=user)
		WorkspaceMembership.objects.create(workspace=workspace, user=user, role=WorkspaceMembership.OWNER)

		response = self.client.post(reverse('auth-login'), {'email': user.email, 'password': 'M0re-Secure!Account-954'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertTrue(response.data['authenticated'])
		self.assertEqual(response.data['workspaces'][0]['id'], str(workspace.id))

	def test_private_api_requires_authentication(self):
		self.client.force_authenticate(user=None)
		response = self.client.get(reverse('project-list'))
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_project_list_only_returns_active_workspace_records(self):
		user = get_user_model().objects.create_user(username='workspace-user', email='workspace-user@example.com', password='Test-password-8492!')
		self.workspace = Workspace.objects.create(name='Personal', workspace_type=Workspace.PERSONAL, created_by=user)
		WorkspaceMembership.objects.create(workspace=self.workspace, user=user, role=WorkspaceMembership.OWNER)
		self.client.force_authenticate(user=user)
		Project.objects.create(workspace=self.workspace, title='My workspace project')
		other_workspace = Workspace.objects.create(name='Other', workspace_type=Workspace.PERSONAL)
		Project.objects.create(workspace=other_workspace, title='Private project')

		response = self.client.get(reverse('project-list'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual([item['title'] for item in response.data], ['My workspace project'])

	def test_owner_can_share_live_project_with_active_team_and_team_member_sees_it(self):
		team = Workspace.objects.create(name='Shared team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		project = Project.objects.create(workspace=self.workspace, title='Shared project')
		share_response = self.client.patch(reverse('project-detail', args=[project.id]), {
			'shared_with': [str(team.id)],
		}, format='json')
		self.assertEqual(share_response.status_code, status.HTTP_200_OK)

		member = get_user_model().objects.create_user(username='team-member', email='team-member@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)
		self.client.force_authenticate(user=member)
		response = self.client.get(reverse('project-list'), HTTP_X_WORKSPACE_ID=str(team.id))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual([item['title'] for item in response.data], ['Shared project'])

	def test_owner_cannot_share_card_to_unjoined_team(self):
		team = Workspace.objects.create(name='Unjoined team', workspace_type=Workspace.TEAM)
		project = Project.objects.create(workspace=self.workspace, title='Private project')
		response = self.client.patch(reverse('project-detail', args=[project.id]), {
			'shared_with': [str(team.id)],
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_team_member_can_edit_shared_live_project_but_cannot_reshare_it(self):
		team = Workspace.objects.create(name='Shared team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		project = Project.objects.create(workspace=self.workspace, title='Shared project')
		project.shared_with.add(team)
		member = get_user_model().objects.create_user(username='editor', email='editor@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)
		self.client.force_authenticate(user=member)

		edit_response = self.client.patch(reverse('project-detail', args=[project.id]), {'title': 'Edited by team'}, format='json', HTTP_X_WORKSPACE_ID=str(team.id))
		share_response = self.client.patch(reverse('project-detail', args=[project.id]), {'shared_with': []}, format='json', HTTP_X_WORKSPACE_ID=str(team.id))

		self.assertEqual(edit_response.status_code, status.HTTP_200_OK)
		self.assertEqual(share_response.status_code, status.HTTP_403_FORBIDDEN)

	def test_sharing_group_propagates_to_projects_on_its_canvas(self):
		team = Workspace.objects.create(name='Group team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		project = Project.objects.create(workspace=self.workspace, title='Group project')
		group = ProjectGroup.objects.create(workspace=self.workspace, title='Shared group')
		ProjectGroupItem.objects.create(group=group, project=project, item_type=ProjectGroupItem.PROJECT)

		response = self.client.patch(reverse('projectgroup-detail', args=[group.id]), {'shared_with': [str(team.id)]}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertTrue(project.shared_with.filter(id=team.id).exists())

	def test_sharing_tool_propagates_to_its_skills(self):
		team = Workspace.objects.create(name='Tool team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		skill = Skill.objects.create(workspace=self.workspace, name='Interviewing')
		tool = Tool.objects.create(workspace=self.workspace, name='Interview kit')
		tool.skills.add(skill)

		response = self.client.patch(reverse('tool-detail', args=[tool.id]), {'shared_with': [str(team.id)]}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		skill.refresh_from_db()
		self.assertTrue(skill.shared_with.filter(id=team.id).exists())

	def test_preferences_are_saved_to_the_authenticated_user(self):
		response = self.client.patch(reverse('user-preferences'), {
			'selectedColorSchemeId': 'tideline',
			'accessibility': {'textSize': 'large', 'highContrast': True, 'reduceMotion': False},
			'reportPrompt': 'Focus on open risks.',
			'reviewReportData': False,
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['selectedColorSchemeId'], 'tideline')
		self.assertFalse(response.data['reviewReportData'])
		self.client.force_authenticate(user=None)
		self.assertEqual(self.client.get(reverse('user-preferences')).status_code, status.HTTP_403_FORBIDDEN)

	@patch('api.views.store_gemini_api_key')
	def test_team_key_can_only_be_managed_by_team_admin(self, store_key):
		team = Workspace.objects.create(name='Gemini team', workspace_type=Workspace.TEAM, created_by=self.user)
		WorkspaceMembership.objects.create(workspace=team, user=self.user, role=WorkspaceMembership.OWNER)
		member = get_user_model().objects.create_user(username='key-member', email='key-member@example.com', password='Test-password-8492!')
		WorkspaceMembership.objects.create(workspace=team, user=member, role=WorkspaceMembership.MEMBER)

		self.client.force_authenticate(user=member)
		response = self.client.post(reverse('gemini-settings'), {'api_key': 'A-secure-test-gemini-key-value'}, format='json', HTTP_X_GEMINI_KEY_WORKSPACE_ID=str(team.id))

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
		store_key.assert_not_called()

		self.client.force_authenticate(user=self.user)
		response = self.client.post(reverse('gemini-settings'), {'api_key': 'A-secure-test-gemini-key-value'}, format='json', HTTP_X_GEMINI_KEY_WORKSPACE_ID=str(team.id))
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		store_key.assert_called_once_with('A-secure-test-gemini-key-value', workspace_id=team.id)

class ColorSchemeAPITests(APITestCase):
	def setUp(self):
		cache.delete('color-schemes:v4')

	def test_color_scheme_json_is_served_and_cached(self):
		first_response = self.client.get(reverse('color-schemes'))
		cached_definitions = cache.get('color-schemes:v4')
		second_response = self.client.get(reverse('color-schemes'))

		self.assertEqual(first_response.status_code, status.HTTP_200_OK)
		self.assertEqual(first_response.data['default'], 'moss')
		self.assertEqual([scheme['id'] for scheme in first_response.data['schemes']], ['moss', 'tideline', 'berry-paper', 'apricot-ink', 'rainforest-gold'])
		self.assertTrue(all(scheme.get('name') and 'description' in scheme for scheme in first_response.data['schemes']))
		self.assertEqual(cached_definitions, first_response.data)
		self.assertEqual(second_response.data, first_response.data)

	def test_color_scheme_schema_is_available(self):
		response = self.client.get(reverse('color-scheme-schema'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn('name', response.data['required'])
		self.assertIn('description', response.data['required'])
		self.assertIn('variables', response.data['required'])
		self.assertIn('--app-bg', response.data['properties']['variables']['required'])

	def test_color_scheme_template_is_available(self):
		response = self.client.get(reverse('color-scheme-template'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['name'], 'My Custom Theme')
		self.assertIn('--app-bg', response.data['variables'])


class GeminiClientTests(SimpleTestCase):
	@override_settings(GEMINI_API_KEY='test-key', GEMINI_MODEL='gemini-test-model')
	@patch('api.gemini.urllib.request.urlopen')
	@patch('api.gemini.get_gemini_api_key', return_value='test-key')
	def test_api_key_test_sends_a_small_prompt(self, get_api_key, urlopen):
		urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({
			'candidates': [{'content': {'parts': [{'text': 'OK'}]}}],
		}).encode()

		self.assertTrue(test_gemini_api_key())
		request = urlopen.call_args.args[0]
		request_body = json.loads(request.data)
		self.assertIn('gemini-test-model:generateContent', request.full_url)
		self.assertEqual(request.headers['X-goog-api-key'], 'test-key')
		self.assertEqual(request_body['generationConfig']['maxOutputTokens'], 16)

	@override_settings(GEMINI_API_KEY='test-key', GEMINI_MODEL='gemini-test-model')
	@patch('api.gemini.urllib.request.urlopen')
	@patch('api.gemini.get_gemini_api_key', return_value='test-key')
	def test_generate_project_report_sends_project_data_and_reads_markdown(self, get_api_key, urlopen):
		urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({
			'candidates': [{'content': {'parts': [{'text': '# Report'}]}}],
		}).encode()

		report = generate_project_report({'project': {'title': 'Test project'}}, 'Focus on milestones.')

		request = urlopen.call_args.args[0]
		request_data = json.loads(request.data)
		self.assertEqual(report, '# Report')
		self.assertIn('gemini-test-model:generateContent', request.full_url)
		self.assertEqual(request.headers['X-goog-api-key'], 'test-key')
		self.assertIn('Test project', request_data['contents'][0]['parts'][0]['text'])
		self.assertIn('Focus on milestones.', request_data['contents'][0]['parts'][0]['text'])

	@override_settings(GEMINI_API_KEY='test-key')
	@patch('api.gemini.urllib.request.urlopen')
	@patch('api.gemini.get_gemini_api_key', return_value='test-key')
	def test_generate_project_report_sends_titled_images_for_contextual_placement(self, get_api_key, urlopen):
		urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({
			'candidates': [{'content': {'parts': [{'text': '# Report\n\n[[PROJECT_IMAGE:image-1]]'}]}}],
		}).encode()
		image_data = base64.b64encode(b'fake-png-bytes').decode()
		project_json = {
			'project': {'title': 'Image project'},
			'nodes': [{
				'id': 'image-1',
				'type': 'image',
				'title': 'Coastal erosion after storm',
				'description': 'North shore comparison photo',
				'image_url': f'data:image/png;base64,{image_data}',
			}],
			'relationships': [],
		}

		report = generate_project_report(project_json)

		parts = json.loads(urlopen.call_args.args[0].data)['contents'][0]['parts']
		prompt = parts[0]['text']
		self.assertIn('Coastal erosion after storm', prompt)
		self.assertIn('[[PROJECT_IMAGE:image-1]]', prompt)
		self.assertEqual(parts[2]['inlineData']['mimeType'], 'image/png')
		self.assertEqual(parts[2]['inlineData']['data'], image_data)
		self.assertIn('[[PROJECT_IMAGE:image-1]]', report)

	@override_settings(GEMINI_API_KEY='test-key')
	@patch('api.gemini.get_gemini_api_key', return_value='test-key')
	@patch('api.gemini.urllib.request.urlopen')
	def test_generate_project_report_rejects_unsupported_image_url(self, urlopen, get_api_key):
		with self.assertRaises(GeminiInputTooLargeError):
			generate_project_report({'nodes': [{'type': 'image', 'title': 'Remote image', 'image_url': 'https://example.test/photo.png'}]})
		urlopen.assert_not_called()

	def test_report_cache_fingerprint_changes_when_picture_changes(self):
		first = {'project': {'title': 'Photo report'}, 'nodes': [{'id': 'image-1', 'type': 'image', 'title': 'Site A', 'image_url': 'data:image/png;base64,AAAA'}], 'relationships': []}
		second = {**first, 'nodes': [{**first['nodes'][0], 'image_url': 'data:image/png;base64,BBBB'}]}
		self.assertNotEqual(project_report_fingerprint(first, ''), project_report_fingerprint(second, ''))

	@override_settings(GEMINI_API_KEY='test-key')
	@patch('api.gemini.get_gemini_api_key', return_value='test-key')
	@patch('api.gemini.urllib.request.urlopen')
	def test_generate_project_report_rejects_oversized_text_before_request(self, urlopen, get_api_key):
		with self.assertRaises(GeminiInputTooLargeError):
			generate_project_report({'description': 'x' * 120_001})
		urlopen.assert_not_called()

	@override_settings(GEMINI_API_KEY='')
	@patch('api.gemini.get_gemini_api_key', return_value='')
	def test_generate_project_report_fails_without_server_api_key(self, get_api_key):
		with self.assertRaises(GeminiConfigurationError):
			generate_project_report({})
