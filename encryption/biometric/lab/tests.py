import json

import pyotp
from django.test import Client, SimpleTestCase, override_settings


class RecognitionApiTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    def test_health_is_synthetic_only(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "synthetic-only")

    def test_numerical_match_uses_threshold(self):
        matched = self.client.post(
            "/v1/recognition",
            data=json.dumps({"values": [0.25, 0.5, 0.75, 1.0]}),
            content_type="application/json",
        )
        unmatched = self.client.post(
            "/v1/recognition",
            data=json.dumps({"values": [0, 0, 0, 0]}),
            content_type="application/json",
        )
        self.assertTrue(matched.json()["eligible"])
        self.assertFalse(unmatched.json()["eligible"])
        self.assertTrue(matched.json()["synthetic_reference"])

    def test_invalid_vector_is_rejected(self):
        response = self.client.post(
            "/v1/recognition",
            data=json.dumps({"values": [1, 2]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(ADMIN_API_TOKEN="demo-token", TOTP_SECRET="JBSWY3DPEHPK3PXP")
    def test_totp_needs_token_and_current_code(self):
        code = pyotp.TOTP("JBSWY3DPEHPK3PXP").now()
        denied = self.client.post(
            "/v1/admin/totp/verify",
            data=json.dumps({"code": code}),
            content_type="application/json",
        )
        accepted = self.client.post(
            "/v1/admin/totp/verify",
            data=json.dumps({"code": code}),
            content_type="application/json",
            HTTP_X_ADMIN_TOKEN="demo-token",
        )
        self.assertEqual(denied.status_code, 401)
        self.assertTrue(accepted.json()["verified"])
