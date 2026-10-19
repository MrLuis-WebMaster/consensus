import base64
import json
import time

import pyotp
from django.test import Client, SimpleTestCase, override_settings

from .auth_service import AUDIT_LOG, CHALLENGE_STORE, RATE_LIMITER, verify_service_ticket


class RecognitionApiTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()
        CHALLENGE_STORE.clear()
        RATE_LIMITER.clear()
        AUDIT_LOG.clear()

    def test_health_is_synthetic_only(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "synthetic-only")
        self.assertFalse(response.json()["face_engine_enabled"])

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


class MultiStepAuthAndSecurityTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()
        CHALLENGE_STORE.clear()
        RATE_LIMITER.clear()
        AUDIT_LOG.clear()

    def _start_login(self, email="participante.demo@consensus.local", token="test-recaptcha-pass-consensus"):
        return self.client.post(
            "/v1/auth/login/start",
            data=json.dumps({"email": email, "recaptcha_token": token}),
            content_type="application/json",
        )

    def test_synthetic_user_completes_full_four_step_login_and_logout(self):
        # Step 1: Email + reCAPTCHA
        step1 = self._start_login("  Participante.Demo@Consensus.Local ")
        self.assertEqual(step1.status_code, 200)
        challenge_id = step1.json()["challenge_id"]
        otp_code = step1.json()["sandbox_otp_preview"]
        self.assertEqual(step1.json()["masked_email"], "p***@c***.local")

        # Step 2: OTP verification
        step2 = self.client.post(
            "/v1/auth/otp/verify",
            data=json.dumps({"challenge_id": challenge_id, "otp_code": otp_code}),
            content_type="application/json",
        )
        self.assertEqual(step2.status_code, 200)
        self.assertEqual(step2.json()["step"], "otp_verified")

        # Replaying the same OTP must be rejected
        replay = self.client.post(
            "/v1/auth/otp/verify",
            data=json.dumps({"challenge_id": challenge_id, "otp_code": otp_code}),
            content_type="application/json",
        )
        self.assertEqual(replay.status_code, 401)

        # Step 3a: Informed biometric consent
        consent = self.client.post(
            "/v1/auth/biometric/consent",
            data=json.dumps({"challenge_id": challenge_id, "accepted": True}),
            content_type="application/json",
        )
        self.assertEqual(consent.status_code, 200)
        self.assertTrue(consent.json()["consent_accepted"])

        # Step 3b: Real FacePlugin engine is not installed in test env -> never fakes a match
        probe = base64.b64encode(b"synthetic-image-bytes").decode("ascii")
        bio_real = self.client.post(
            "/v1/auth/biometric/verify",
            data=json.dumps(
                {
                    "challenge_id": challenge_id,
                    "probe_image_b64": probe,
                    "reference_image_b64": probe,
                    "operation_mode": "1:1",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(bio_real.status_code, 503)
        self.assertFalse(bio_real.json()["matched"])
        self.assertFalse(bio_real.json()["simulated"])
        self.assertFalse(bio_real.json()["engine_enabled"])

        # Step 3c: Complete Step 3 via authorized fallback method
        fallback = self.client.post(
            "/v1/auth/biometric/fallback",
            data=json.dumps(
                {
                    "challenge_id": challenge_id,
                    "fallback_code": "ALT-CONSENSUS-2026",
                    "reason": "faceplugin_not_installed_in_ci",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(fallback.status_code, 200)
        self.assertTrue(fallback.json()["verified"])

        # Step 4: Issue HttpOnly session cookie
        step4 = self.client.post(
            "/v1/auth/session/issue",
            data=json.dumps({"challenge_id": challenge_id}),
            content_type="application/json",
        )
        self.assertEqual(step4.status_code, 200)
        self.assertTrue(step4.json()["authenticated"])
        self.assertEqual(step4.json()["session"]["role"], "participante")
        self.assertTrue(step4.cookies["consensus_session"]["httponly"])

        # Verify /v1/auth/session/me works with cookie session
        me = self.client.get("/v1/auth/session/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["session"]["role"], "participante")

        # Exchange inter-service ticket for FastAPI/Rust
        exchange = self.client.post("/v1/auth/service/exchange")
        self.assertEqual(exchange.status_code, 200)
        ticket_payload = verify_service_ticket(exchange.json()["service_ticket"])
        self.assertIsNotNone(ticket_payload)
        self.assertEqual(ticket_payload["role"], "participante")

        # Participant cannot access admin overview or audit events (RBAC)
        admin_resp = self.client.get("/v1/admin/overview")
        self.assertEqual(admin_resp.status_code, 403)
        audit_resp = self.client.get("/v1/audit/events")
        self.assertEqual(audit_resp.status_code, 403)

        # Logout invalidates session
        logout = self.client.post("/v1/auth/session/logout")
        self.assertEqual(logout.status_code, 200)
        after_logout = self.client.get("/v1/auth/session/me")
        self.assertEqual(after_logout.status_code, 401)

    def test_invalid_recaptcha_token_is_rejected_on_server(self):
        bad = self._start_login(token="invalid-bot-token")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad.json()["error"], "recaptcha_verification_failed")

        arbitrary = self._start_login(token="some-random-client-bypass-token")
        self.assertEqual(arbitrary.status_code, 400)

    def test_expired_otp_is_rejected(self):
        step1 = self._start_login()
        challenge_id = step1.json()["challenge_id"]
        otp_code = step1.json()["sandbox_otp_preview"]

        challenge = CHALLENGE_STORE.get(challenge_id)
        challenge.otp_expires_at = time.time() - 5

        expired = self.client.post(
            "/v1/auth/otp/verify",
            data=json.dumps({"challenge_id": challenge_id, "otp_code": otp_code}),
            content_type="application/json",
        )
        self.assertEqual(expired.status_code, 401)
        self.assertEqual(expired.json()["error"], "otp_expired")

    def test_otp_attempt_limits_and_resend_cooldown(self):
        step1 = self._start_login()
        challenge_id = step1.json()["challenge_id"]
        real_otp = step1.json()["sandbox_otp_preview"]

        # Cooldown blocks immediate resend
        resend_early = self.client.post(
            "/v1/auth/otp/resend",
            data=json.dumps({"challenge_id": challenge_id}),
            content_type="application/json",
        )
        self.assertEqual(resend_early.status_code, 429)
        self.assertEqual(resend_early.json()["error"], "otp_resend_cooldown")

        # 3 wrong attempts exhaust the challenge
        for _ in range(3):
            res = self.client.post(
                "/v1/auth/otp/verify",
                data=json.dumps({"challenge_id": challenge_id, "otp_code": "000000"}),
                content_type="application/json",
            )
            self.assertEqual(res.status_code, 401)

        # Even the real OTP is now rejected because the challenge was invalidated
        locked = self.client.post(
            "/v1/auth/otp/verify",
            data=json.dumps({"challenge_id": challenge_id, "otp_code": real_otp}),
            content_type="application/json",
        )
        self.assertEqual(locked.status_code, 401)

    @override_settings(LOGIN_RATE_LIMIT_MAX_ATTEMPTS=2, LOGIN_RATE_LIMIT_WINDOW_SECONDS=300)
    def test_login_rate_limiting_blocks_excessive_attempts(self):
        self.assertEqual(self._start_login().status_code, 200)
        self.assertEqual(self._start_login().status_code, 200)
        blocked = self._start_login()
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["error"], "rate_limit_exceeded")

    def test_1toN_biometric_identification_and_missing_consent_are_rejected(self):
        step1 = self._start_login()
        challenge_id = step1.json()["challenge_id"]
        otp_code = step1.json()["sandbox_otp_preview"]
        self.client.post(
            "/v1/auth/otp/verify",
            data=json.dumps({"challenge_id": challenge_id, "otp_code": otp_code}),
            content_type="application/json",
        )

        # Verify without consent -> 403
        no_consent = self.client.post(
            "/v1/auth/biometric/verify",
            data=json.dumps({"challenge_id": challenge_id, "operation_mode": "1:1"}),
            content_type="application/json",
        )
        self.assertEqual(no_consent.status_code, 403)
        self.assertEqual(no_consent.json()["error"], "biometric_consent_required")

        # Grant consent, then attempt 1:N -> 403
        self.client.post(
            "/v1/auth/biometric/consent",
            data=json.dumps({"challenge_id": challenge_id, "accepted": True}),
            content_type="application/json",
        )
        mode_1ton = self.client.post(
            "/v1/auth/biometric/verify",
            data=json.dumps({"challenge_id": challenge_id, "operation_mode": "1:N"}),
            content_type="application/json",
        )
        self.assertEqual(mode_1ton.status_code, 403)
        self.assertEqual(mode_1ton.json()["error"], "1toN_identification_prohibited")

    def test_protected_endpoints_reject_unauthenticated_and_allow_admin_auditor(self):
        self.assertEqual(self.client.get("/v1/auth/session/me").status_code, 401)
        self.assertEqual(self.client.get("/v1/admin/overview").status_code, 401)
        self.assertEqual(self.client.get("/v1/audit/events").status_code, 401)

        # Authenticate as admin.demo@consensus.local
        step1 = self._start_login("admin.demo@consensus.local")
        cid = step1.json()["challenge_id"]
        otp = step1.json()["sandbox_otp_preview"]
        self.client.post(
            "/v1/auth/otp/verify",
            data=json.dumps({"challenge_id": cid, "otp_code": otp}),
            content_type="application/json",
        )
        self.client.post(
            "/v1/auth/biometric/fallback",
            data=json.dumps({"challenge_id": cid, "fallback_code": "ALT-CONSENSUS-2026"}),
            content_type="application/json",
        )
        self.client.post(
            "/v1/auth/session/issue",
            data=json.dumps({"challenge_id": cid}),
            content_type="application/json",
        )

        admin_ok = self.client.get("/v1/admin/overview")
        self.assertEqual(admin_ok.status_code, 200)
        self.assertTrue(admin_ok.json()["admin_authorized"])

        audit_ok = self.client.get("/v1/audit/events")
        self.assertEqual(audit_ok.status_code, 200)
        events_dump = json.dumps(audit_ok.json()["events"])
        self.assertNotIn(otp, events_dump)
        self.assertNotIn("admin.demo@consensus.local", events_dump)
