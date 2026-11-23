package com.beboss.shopmgmt

import android.content.Context
import android.graphics.BitmapFactory
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.util.BrandedShareCardGenerator
import com.beboss.shopmgmt.util.ContactsHelper
import com.beboss.shopmgmt.util.QrCodeGenerator
import com.beboss.shopmgmt.util.ReceiptGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class BrandingAndQrRobolectricTest {

    private lateinit var context: Context

    private val profile = ShopProfile(
        id = 1L,
        name = "Jean Claude",
        phone = "+250788000111",
        shopName = "Kigali Prime Supply",
        address = "Nyarugenge Market",
        currencyCode = "RWF",
        currencySymbol = "FRw",
        tinNumber = "102938475"
    )

    private val sale = Sale(
        id = "sale-test-001",
        receiptNumber = "RC-2026-0091",
        customerId = "cust-1",
        customerName = "Alice Uwimana",
        saleDate = 1_760_000_000_000L,
        totalAmount = 25000.0,
        totalCost = 18000.0,
        totalProfit = 7000.0,
        paymentMethod = "MOMO",
        paymentStatus = "PAID",
        amountPaid = 25000.0,
        branchId = "main_branch",
        branchName = "Main HQ",
        cashierId = "user-1",
        cashierName = "Jean Claude"
    )

    private val items = listOf(
        SaleItem(
            id = "item-1",
            saleId = "sale-test-001",
            productId = "prod-1",
            productName = "Inyange Milk 1L",
            category = "Beverages",
            unit = "pcs",
            quantitySold = 5.0,
            costPriceAtSale = 1800.0,
            unitPriceAtSale = 2500.0,
            subtotal = 12500.0,
            profit = 3500.0,
            branchId = "main_branch"
        ),
        SaleItem(
            id = "item-2",
            saleId = "sale-test-001",
            productId = "prod-2",
            productName = "Basmati Rice 5kg",
            category = "Grains",
            unit = "bag",
            quantitySold = 1.0,
            costPriceAtSale = 9000.0,
            unitPriceAtSale = 12500.0,
            subtotal = 12500.0,
            profit = 3500.0,
            branchId = "main_branch"
        )
    )

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun `qr payload round-trips and generates real QR matrix bitmap`() {
        val seal = ReceiptGenerator.computeOfflineReceiptSeal(sale, profile)
        assertTrue(seal.startsWith("BB-"))
        assertTrue(ReceiptGenerator.verifyOfflineReceiptSeal(sale, profile, seal))
        assertFalse(ReceiptGenerator.verifyOfflineReceiptSeal(sale, profile, "BB-0000000000"))

        val payload = QrCodeGenerator.buildReceiptQrPayload(sale, profile, seal)
        val parsed = QrCodeGenerator.parseReceiptQrPayload(payload)
        assertNotNull(parsed)
        assertEquals(sale.receiptNumber, parsed!!.receiptNumber)
        assertEquals(seal, parsed.seal)
        assertEquals(25000.0, parsed.totalAmount ?: 0.0, 0.01)

        val qrBitmap = QrCodeGenerator.generateQrBitmap(payload, sizePx = 256)
        assertEquals(256, qrBitmap.width)
        assertEquals(256, qrBitmap.height)
    }

    @Test
    fun `branded share cards include app logo and produce non-empty PNG assets`() {
        val logo = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 96)
        assertNotNull(logo)
        assertEquals(96, logo!!.width)

        val receiptPng = BrandedShareCardGenerator.generateReceiptCardPng(context, sale, items, profile)
        assertTrue(receiptPng.exists() && receiptPng.length() > 1024L)
        val decodedReceipt = BitmapFactory.decodeFile(receiptPng.absolutePath)
        assertNotNull(decodedReceipt)
        assertEquals(840, decodedReceipt.width)

        val customer = Customer(
            id = "cust-1",
            name = "Alice Uwimana",
            phone = "+250788222333",
            debtBalance = 14500.0
        )
        val customerPng = BrandedShareCardGenerator.generateCustomerDebtCardPng(context, customer, profile)
        assertTrue(customerPng.exists() && customerPng.length() > 1024L)

        val branchPng = BrandedShareCardGenerator.generateBranchSummaryCardPng(
            context = context,
            profile = profile,
            branchCount = 3,
            staffCount = 8,
            totalRevenue = 420000.0,
            productCount = 64
        )
        assertTrue(branchPng.exists() && branchPng.length() > 1024L)
    }

    @Test
    fun `printable receipt embeds logo and QR and escapes untrusted fields`() {
        val unsafeProfile = profile.copy(shopName = "<script>alert(1)</script>")
        val unsafeSale = sale.copy(customerName = "<img src=x onerror=alert(1)>")
        val unsafeItems = items.mapIndexed { index, item ->
            if (index == 0) item.copy(productName = "<script>bad()</script>") else item
        }

        val html = ReceiptGenerator.generateHtmlReceipt(
            context = context,
            sale = unsafeSale,
            items = unsafeItems,
            profile = unsafeProfile
        )

        assertTrue(html.contains("data:image/png;base64,"))
        assertTrue(html.contains("alt=\"BeBoss logo\""))
        assertTrue(html.contains("alt=\"Receipt verification QR\""))
        assertTrue(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"))
        assertTrue(html.contains("&lt;img src=x onerror=alert(1)&gt;"))
        assertFalse(html.contains("<script>alert(1)</script>"))
        assertFalse(html.contains("<script>bad()</script>"))
        assertFalse(html.contains("<img src=x onerror=alert(1)>"))
    }

    @Test
    fun `contact phone normalization prevents duplicate imports without changing display value`() {
        assertEquals("250788123456", ContactsHelper.normalizePhoneNumber(" +250 (788) 123-456 "))
        assertEquals("", ContactsHelper.normalizePhoneNumber("   "))
    }

}
