package com.beboss.shopmgmt.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExcelCsvExporterTest {

    @Test
    fun `parses the BeBoss exported inventory headers without changing quantity or prices`() {
        val csv = """ID,Product Name,Barcode / SKU,Category,Quantity in Stock,Unit,Cost Price (FRw),Selling Price (FRw),Gross Profit Margin %,Total Cost Value,Total Retail Value,Low Stock Status
"P-1","Milk, Whole","12345","Dairy",12.5,"bottle",650,900,27.8%,8125,11250,HEALTHY
"""

        val product = ExcelCsvExporter.parseProductsCsv(csv).single()

        assertEquals("Milk, Whole", product.name)
        assertEquals("12345", product.barcode)
        assertEquals("Dairy", product.category)
        assertEquals(12.5, product.quantityInStock, 0.0001)
        assertEquals("bottle", product.unit)
        assertEquals(650.0, product.costPrice, 0.0001)
        assertEquals(900.0, product.sellingPrice, 0.0001)
    }

    @Test
    fun `recognizes currency suffixes in exported cost and selling price headings`() {
        val csv = """Product Name,Category,Quantity,Cost Price (RWF),Selling Price (RWF)
Rice,Grains,24,1800,2300
"""

        val product = ExcelCsvExporter.parseProductsCsv(csv).single()

        assertEquals(24.0, product.quantityInStock, 0.0001)
        assertEquals(1800.0, product.costPrice, 0.0001)
        assertEquals(2300.0, product.sellingPrice, 0.0001)
    }

    @Test
    fun `parses the documented legacy seven column format`() {
        val csv = """Name,Category,CostPrice,SellingPrice,Quantity,Unit,Barcode
Flour,Grains,1100,1400,30,kg,SKU-1
"""

        val product = ExcelCsvExporter.parseProductsCsv(csv).single()

        assertEquals("Flour", product.name)
        assertEquals("Grains", product.category)
        assertEquals(1100.0, product.costPrice, 0.0001)
        assertEquals(1400.0, product.sellingPrice, 0.0001)
        assertEquals(30.0, product.quantityInStock, 0.0001)
        assertEquals("kg", product.unit)
        assertEquals("SKU-1", product.barcode)
    }

    @Test
    fun `rejects rows with absent invalid or negative stock and price values`() {
        val csv = """Name,Category,CostPrice,SellingPrice,Quantity,Unit,Barcode
Missing selling,Dairy,500,,10,bottle,SKU-2
Missing quantity,Dairy,500,700,,bottle,SKU-3
Invalid quantity,Dairy,500,700,NaN,bottle,SKU-4
Negative price,Dairy,-5,700,10,bottle,SKU-5
"""

        assertTrue(ExcelCsvExporter.parseProductsCsv(csv).isEmpty())
    }

    @Test
    fun `headerless BeBoss exports keep the explicit values`() {
        val csv = """P-2,Soap,SKU-2,Household,8,pcs,400,600
"""

        val product = ExcelCsvExporter.parseProductsCsv(csv).single()

        assertEquals("Soap", product.name)
        assertEquals(8.0, product.quantityInStock, 0.0001)
        assertEquals(400.0, product.costPrice, 0.0001)
        assertEquals(600.0, product.sellingPrice, 0.0001)
    }
}
