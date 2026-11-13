# opa test eap/api/src/req/policy -v   (korpus data.keis.guardrail_cases dipakai JUGA oleh uji Jest mesin lokal → paritas)
package keis.guardrail_test

import rego.v1

import data.keis.guardrail
import data.system.authz

# kasus korpus yang hasilnya tidak sesuai (kosong = lulus); ditampilkan oleh `opa test --explain fails`
mismatches contains c if {
	some c in data.keis.guardrail_cases
	d := guardrail.decision with input as {"text": c.text, "first_turn": c.first_turn}
	not matches(d, c)
}

matches(d, c) if {
	d.allowed == c.allowed
	object.get(d, "category", "") == object.get(c, "category", "")
}

test_korpus_sesuai if count(mismatches) == 0

test_korpus_tidak_kosong if count(data.keis.guardrail_cases) >= 10

test_terlalu_panjang if {
	d := guardrail.decision with input as {"text": concat("", array.concat(["sistem "], [x | some i in numbers.range(1, 4000); x := "a"])), "first_turn": false}
	d.allowed == false
	d.category == "too-long"
}

test_fail_closed_input_tidak_sah if {
	guardrail.decision.allowed == false with input as {}
	guardrail.decision.category == "internal" with input as {"text": 123, "first_turn": false}
	guardrail.decision.allowed == false with input as {"text": "sistem aplikasi", "first_turn": "ya"}
}

test_authz_hanya_keputusan_dan_health if {
	authz.allow with input as {"method": "POST", "path": ["v1", "data", "keis", "guardrail", "decision"]}
	authz.allow with input as {"method": "GET", "path": ["health"]}
	not authz.allow with input as {"method": "PUT", "path": ["v1", "policies", "guardrail"]}
	not authz.allow with input as {"method": "DELETE", "path": ["v1", "policies", "guardrail"]}
	not authz.allow with input as {"method": "GET", "path": ["v1", "data"]}
	not authz.allow with input as {"method": "POST", "path": ["v1", "data", "keis", "guardrail_rules"]}
	not authz.allow with input as {"method": "PUT", "path": ["v1", "data", "keis", "guardrail_rules"]}
}
