import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assertBranchesOpenForTransfer, normalizeBranchOperationalStatus } from "./branch-rules.ts";

Deno.test("branch status values are canonical and legacy suspended is normalized", () => {
  assertEquals(normalizeBranchOperationalStatus("open"), "OPEN");
  assertEquals(normalizeBranchOperationalStatus(" suspended "), "PAUSED");
  assertEquals(normalizeBranchOperationalStatus("PAUSED"), "PAUSED");
  assertEquals(normalizeBranchOperationalStatus("CLOSED"), "CLOSED");
});

Deno.test("invalid branch statuses are rejected", () => {
  assertThrows(() => normalizeBranchOperationalStatus("DELETED"), Error, "Branch operating status");
});

Deno.test("stock transfers require both locations to be open", () => {
  assertBranchesOpenForTransfer("OPEN", "OPEN");
  assertThrows(() => assertBranchesOpenForTransfer("PAUSED", "OPEN"), Error, "Both source and destination");
  assertThrows(() => assertBranchesOpenForTransfer("OPEN", "CLOSED"), Error, "Both source and destination");
});
