from getpass import getpass

from django.contrib.auth import get_user_model, password_validation
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
import keyring

from api.gemini import KEYRING_SERVICE, KEYRING_USERNAME
from api.models import AccountProfile, Workspace, WorkspaceGeminiCredential, WorkspaceMembership


class Command(BaseCommand):
    help = 'Set the email and password for the initial ProjectNote administrator.'

    def add_arguments(self, parser):
        parser.add_argument('--email', help='Email for the initial administrator.')

    @transaction.atomic
    def handle(self, *args, **options):
        user_model = get_user_model()
        try:
            admin = user_model.objects.get(username='projectnote-initial-admin', is_superuser=True)
        except user_model.DoesNotExist as error:
            raise CommandError('The initial admin account was not found. Apply database migrations first.') from error

        email = (options['email'] or input('Admin email: ')).strip().lower()
        if not email or user_model.objects.exclude(pk=admin.pk).filter(email__iexact=email).exists():
            raise CommandError('Enter a valid email that is not already used by another account.')

        password = getpass('Admin password: ')
        password_confirmation = getpass('Confirm admin password: ')
        if password != password_confirmation:
            raise CommandError('The passwords do not match.')
        try:
            password_validation.validate_password(password, user=admin)
        except Exception as error:
            raise CommandError(str(error)) from error

        admin.email = email
        admin.set_password(password)
        admin.save(update_fields=['email', 'password'])
        AccountProfile.objects.update_or_create(user=admin, defaults={'email_verified': True})
        membership = WorkspaceMembership.objects.filter(user=admin, workspace__workspace_type=Workspace.PERSONAL).select_related('workspace').first()
        if membership:
            membership.role = WorkspaceMembership.OWNER
            membership.status = WorkspaceMembership.ACTIVE
            membership.save(update_fields=['role', 'status'])
            try:
                legacy_key = keyring.get_password(KEYRING_SERVICE, KEYRING_USERNAME)
            except Exception:
                legacy_key = None
            if legacy_key:
                keyring.set_password(KEYRING_SERVICE, f'{KEYRING_USERNAME}:{membership.workspace_id}', legacy_key)
                keyring.delete_password(KEYRING_SERVICE, KEYRING_USERNAME)
                WorkspaceGeminiCredential.objects.get_or_create(workspace=membership.workspace)
        self.stdout.write(self.style.SUCCESS(f'Initial administrator configured: {email}'))
