from rest_framework.test import APITestCase

from .models import User


class ChangePasswordTests(APITestCase):
    url = '/api/auth/change-password/'

    def setUp(self):
        self.user = User.objects.create_user('cash', password='oldpass1', role='cashier')
        self.client.force_authenticate(self.user)

    def test_changes_password(self):
        res = self.client.post(self.url, {'current_password': 'oldpass1', 'new_password': 'Newpass99'})
        self.assertEqual(res.status_code, 200, res.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Newpass99'))

    def test_wrong_current_password(self):
        res = self.client.post(self.url, {'current_password': 'nope', 'new_password': 'Newpass99'})
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('oldpass1'))

    def test_too_short_or_same(self):
        self.assertEqual(self.client.post(self.url, {'current_password': 'oldpass1', 'new_password': 'abc'}).status_code, 400)
        self.assertEqual(self.client.post(self.url, {'current_password': 'oldpass1', 'new_password': 'oldpass1'}).status_code, 400)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url, {}).status_code, 401)
