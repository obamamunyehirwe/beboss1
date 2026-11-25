import { assertEquals } from "jsr:@std/assert@1";
import { AFRICASTALKING_LIVE_URL, AFRICASTALKING_SANDBOX_URL, isAfricaTalkingSmsAccepted, isValidAfricaTalkingEnvironment, isValidInternationalPhone, normalizeAfricaTalkingHookSecret } from "./africastalking.ts";
Deno.test("Africa's Talking endpoints and environment are explicit", () => {
  assertEquals(AFRICASTALKING_SANDBOX_URL, "https://api.sandbox.africastalking.com/version1/messaging");
  assertEquals(AFRICASTALKING_LIVE_URL, "https://api.africastalking.com/version1/messaging");
  assertEquals(isValidAfricaTalkingEnvironment("sandbox"), true);
  assertEquals(isValidAfricaTalkingEnvironment("production"), true);
  assertEquals(isValidAfricaTalkingEnvironment("live"), false);
});
Deno.test("webhook secret rotation supports standard version prefixes", () => {
  assertEquals(normalizeAfricaTalkingHookSecret("v1,whsec_YWJjZA==|v1,whsec_ZGVmZw=="), ["YWJjZA==", "ZGVmZw=="]);
});
Deno.test("only E.164 destinations and accepted single-recipient responses pass", () => {
  assertEquals(isValidInternationalPhone("+250788123456"), true);
  assertEquals(isValidInternationalPhone("0788123456"), false);
  for (const statusCode of [100,101,102]) assertEquals(isAfricaTalkingSmsAccepted({SMSMessageData:{Recipients:[{statusCode}]}}), true);
  assertEquals(isAfricaTalkingSmsAccepted({SMSMessageData:{Recipients:[{statusCode:401}]}}), false);
  assertEquals(isAfricaTalkingSmsAccepted({SMSMessageData:{Recipients:[{statusCode:101},{statusCode:101}]}}), false);
});
