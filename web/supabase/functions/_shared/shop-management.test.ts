import { assertEquals } from "jsr:@std/assert@1";
import { EXTRA_DEVICE_MONTHLY_FEE_RWF, monthlyShopFeeRwf } from "./shop-management.ts";
Deno.test("each additional active desktop/mobile device costs FRw 2,000 per month",()=>{
 assertEquals(EXTRA_DEVICE_MONTHLY_FEE_RWF,2000);
 assertEquals(monthlyShopFeeRwf(1,1,1),5000);
 assertEquals(monthlyShopFeeRwf(1,1,2),7000);
 assertEquals(monthlyShopFeeRwf(1,1,4),11000);
});
Deno.test("branch and staff pricing remains consistent with shop plan",()=>{
 assertEquals(monthlyShopFeeRwf(2,3,2),14000);
 // Match the Android subscription calculator: a sixth worker adds FRw 1,000.
 assertEquals(monthlyShopFeeRwf(3,6,3),29000);
});
