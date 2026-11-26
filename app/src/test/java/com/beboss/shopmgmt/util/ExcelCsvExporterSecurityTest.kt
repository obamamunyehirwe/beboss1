package com.beboss.shopmgmt.util

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ShopProfile
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExcelCsvExporterSecurityTest {

    @Test
    fun `inventory export neutralizes formula-leading product fields`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val csvFile = ExcelCsvExporter.exportProductsCsv(
            context,
            listOf(
                Product(
                    id = "product-1",
                    name = "=1+1",
                    category = "  +SUM(1,1)",
                    barcode = "\t@SUM(1,1)"
                )
            ),
            ShopProfile()
        )

        try {
            val csv = csvFile.readText(Charsets.UTF_8)
            assertTrue(csv.contains("\"'=1+1\""))
            assertTrue(csv.contains("\"'  +SUM(1,1)\""))
            assertTrue(csv.contains("\"'\t@SUM(1,1)\""))
        } finally {
            csvFile.delete()
        }
    }
}
