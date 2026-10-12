from django.urls import reverse
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .gemini import GeminiConfigurationError, GeminiGenerationError, GeminiInputTooLargeError, generate_project_report, test_gemini_api_key
from .models import Project, ProjectGroup, ProjectGroupItem, ProjectNode, Skill, Tool


class ToolSkillAPITests(APITestCase):
	def setUp(self):
		self.skills_url = reverse('skill-list')
		self.tools_url = reverse('tool-list')
		self.skill_a = Skill.objects.create(name='Interviewing', description='Asks useful questions.')
		self.skill_b = Skill.objects.create(name='Thematic coding', description='Groups recurring ideas.')

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
		tool = Tool.objects.create(name='Single skill tool')
		tool.skills.add(self.skill_a)

		response = self.client.delete(reverse('skill-detail', args=[self.skill_a.id]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(Skill.objects.filter(id=self.skill_a.id).exists())

	def test_tool_update_replaces_skill_relationships(self):
		tool = Tool.objects.create(name='Research tool')
		tool.skills.add(self.skill_a, self.skill_b)

		response = self.client.patch(reverse('tool-detail', args=[tool.id]), {
			'skillIds': [str(self.skill_b.id)],
		}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(list(Tool.objects.get(id=tool.id).skills.values_list('id', flat=True)), [self.skill_b.id])


class ProjectReportGenerationTests(APITestCase):
	def setUp(self):
		self.project = Project.objects.create(title='Recipe planner', description='Plan weekly meals.')
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
		self.project = Project.objects.create(title='Ordered flow')
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
		self.project = Project.objects.create(title='Field survey', description='Collect observations.')
		self.group = ProjectGroup.objects.create(title='Research program', description='Projects for the field study.')

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
		other_group = ProjectGroup.objects.create(title='Other group')
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
		store_key.assert_called_once_with('test-gemini-api-key-value')

	@patch('api.views.test_gemini_api_key')
	@patch('api.views.mark_gemini_api_key_validated')
	@patch('api.views.gemini_settings_payload', return_value={'configured': True, 'validated': True, 'model': 'gemini-test', 'source': 'Windows Credential Manager'})
	def test_key_test_marks_api_key_verified_only_after_provider_success(self, settings_payload, mark_validated, test_key):
		response = self.client.post(reverse('gemini-settings-test'), {}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertTrue(response.data['validated'])
		test_key.assert_called_once_with()
		mark_validated.assert_called_once_with()

	@patch('api.views.clear_gemini_api_key_validation')
	@patch('api.views.test_gemini_api_key', side_effect=GeminiGenerationError('Quota exceeded.'))
	def test_failed_key_test_clears_verified_status(self, test_key, clear_validation):
		response = self.client.post(reverse('gemini-settings-test'), {}, format='json')

		self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
		clear_validation.assert_called_once_with()


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
	def test_generate_project_report_omits_image_data_from_prompt(self, get_api_key, urlopen):
		urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({
			'candidates': [{'content': {'parts': [{'text': '# Report'}]}}],
		}).encode()
		project_json = {
			'project': {'title': 'Image project'},
			'nodes': [{
				'title': 'Photo',
				'content': 'Image caption',
				'image_url': 'data:image/png;base64,' + ('A' * 200_000),
			}],
			'relationships': [],
		}

		generate_project_report(project_json)

		prompt = json.loads(urlopen.call_args.args[0].data)['contents'][0]['parts'][0]['text']
		self.assertIn('Image caption', prompt)
		self.assertNotIn('image_url', prompt)
		self.assertNotIn('data:image/png;base64', prompt)

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
