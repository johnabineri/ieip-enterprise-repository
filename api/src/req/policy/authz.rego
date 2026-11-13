# Otorisasi API OPA itu sendiri (opa run --authorization=basic). Tanpa ini, siapa pun di jaringan dapat MENGGANTI kebijakan
# (PUT /v1/policies) atau membaca seluruh data. Yang diizinkan hanya: keputusan guardrail dan pemeriksaan kesehatan.
package system.authz

import rego.v1

default allow := false

allow if {
	input.method == "POST"
	input.path == ["v1", "data", "keis", "guardrail", "decision"]
}

allow if {
	input.method == "GET"
	input.path == ["health"]
}
