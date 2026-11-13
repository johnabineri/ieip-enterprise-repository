# Guardrail REQ & GSE-AI (REQ-02/03, D-03) — dievaluasi OPA SEBELUM teks menyentuh LLM mana pun.
# Aturan dan pola dibaca dari data.keis.guardrail_rules (data.json; SATU SUMBER dengan mesin lokal req/guardrails.ts).
# Kontrak: POST /v1/data/keis/guardrail/decision  input {text: string, first_turn: bool}  →  {allowed, category?, reason?}
# Fail-closed: input tidak sah atau aturan tidak menghasilkan keputusan → `default decision` = DITOLAK (bukan diloloskan).
# Batas jujur: ini klasifikasi berbasis POLA (anti-jailbreak/prompt-injection + domain-fencing kata kunci), bukan model semantik
# (bukan NeMo) dan tidak mengklaim akurasi tertentu. count() menghitung rune (mesin lokal JS menghitung unit UTF-16).
package keis.guardrail

import rego.v1

rules := data.keis.guardrail_rules

default decision := {"allowed": false, "category": "internal", "reason": "Input guardrail tidak sah atau kebijakan tidak menghasilkan keputusan (fail-closed)."}

valid_input if {
	is_string(input.text)
	is_boolean(input.first_turn)
}

too_long if count(input.text) > rules.max_len

jailbreak if {
	some p in rules.jailbreak_ci
	regex.match(concat("", ["(?i)", p]), input.text)
}

jailbreak if {
	some p in rules.jailbreak_cs
	regex.match(p, input.text)
}

domain if regex.match(concat("", ["(?i)", rules.domain_ci]), input.text)

off_topic if regex.match(concat("", ["(?i)", rules.off_topic_ci]), input.text)

deny(category) := {"allowed": false, "category": category, "reason": rules.reasons[category]}

decision := deny("too-long") if {
	valid_input
	too_long
} else := deny("jailbreak") if {
	valid_input
	jailbreak
} else := deny("off-topic") if {
	valid_input
	off_topic
	not domain
} else := {"allowed": false, "category": "off-topic", "reason": rules.reasons["first-turn"]} if {
	valid_input
	input.first_turn
	not domain
} else := {"allowed": true} if valid_input
