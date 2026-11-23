package com.beboss.shopmgmt.util

/**
 * Inventory vocabulary for each shop vertical selected during registration.
 * Persisted product values remain short, stable unit/category identifiers so existing
 * stock, sales, receipts and cloud snapshots continue to work unchanged.
 */
data class BusinessVertical(
    val key: String,
    val label: String,
    val categories: List<String>,
    val units: List<String>
)

object BusinessCatalog {
    const val GENERAL_RETAIL = "sector_retail"
    const val FASHION = "sector_fashion"
    const val ELECTRONICS = "sector_electronics"
    const val PHARMACY = "sector_pharmacy"
    const val HARDWARE = "sector_hardware"
    const val RESTAURANT = "sector_restaurant"
    const val WHOLESALE = "sector_wholesale"
    const val SALON = "sector_salon"

    private val commonUnits = listOf("pcs", "unit", "box", "pack", "carton", "dozen", "pair", "set")

    val verticals = listOf(
        BusinessVertical(
            GENERAL_RETAIL,
            "General retail & convenience",
            listOf("Grocery & Staples", "Fresh Produce", "Dairy & Eggs", "Meat & Seafood", "Bakery", "Beverages", "Household", "Cleaning & Laundry", "Personal Care", "Baby & Kids", "Stationery", "Pet Supplies", "Other"),
            listOf("pcs", "kg", "g", "L", "mL", "bottle", "can", "bag", "sack", "box", "pack", "carton", "tray", "dozen", "pair", "set", "roll", "m", "bundle")
        ),
        BusinessVertical(
            FASHION,
            "Fashion, clothing & footwear",
            listOf("Clothing", "Footwear", "Bags & Accessories", "Jewelry & Watches", "Fabrics & Textiles", "Beauty & Cosmetics", "Uniforms", "Alterations", "Other"),
            listOf("pcs", "pair", "set", "roll", "m", "cm", "box", "pack", "dozen", "bundle")
        ),
        BusinessVertical(
            ELECTRONICS,
            "Electronics & appliances",
            listOf("Smartphones", "Computers & Tablets", "Phone Accessories", "Computer Accessories", "Audio & Video", "Cameras", "Home Appliances", "Gaming", "Cables & Power", "Repairs & Services", "Other"),
            listOf("pcs", "unit", "set", "box", "pack", "carton", "pair", "m", "roll")
        ),
        BusinessVertical(
            PHARMACY,
            "Pharmacy & medical supplies",
            listOf("Prescription Medicines", "Over-the-Counter Medicines", "Medical Devices", "First Aid", "Vitamins & Supplements", "Personal Care", "Baby Care", "Diagnostics", "Medical Consumables", "Other"),
            listOf("tablet", "capsule", "strip", "blister", "bottle", "vial", "ampoule", "tube", "sachet", "pack", "box", "pcs", "mL", "L", "mg", "g")
        ),
        BusinessVertical(
            HARDWARE,
            "Hardware & construction materials",
            listOf("Cement & Aggregates", "Timber & Boards", "Plumbing", "Electrical", "Tools & Hardware", "Paint & Finishes", "Roofing", "Tiles & Sanitary Ware", "Fasteners", "Safety Equipment", "Other"),
            listOf("pcs", "kg", "g", "tonne", "bag", "sack", "m", "cm", "mm", "ft", "sheet", "board", "roll", "box", "pack", "pail", "L", "mL", "bundle")
        ),
        BusinessVertical(
            RESTAURANT,
            "Restaurant, café & food service",
            listOf("Prepared Meals", "Breakfast", "Snacks & Sides", "Bakery & Desserts", "Hot Drinks", "Cold Drinks", "Alcohol-free Beverages", "Fresh Ingredients", "Meat & Seafood", "Packaging", "Other"),
            listOf("portion", "serving", "plate", "cup", "glass", "bottle", "can", "kg", "g", "L", "mL", "pcs", "pack", "bag", "tray", "sachet")
        ),
        BusinessVertical(
            WHOLESALE,
            "Wholesale & distribution",
            listOf("Bulk Groceries", "Bulk Grains & Flour", "Bulk Beverages", "Bulk Household Goods", "Raw Materials", "Building Supplies", "Agricultural Inputs", "Distribution Supplies", "Other"),
            listOf("carton", "case", "pallet", "sack", "bag", "kg", "tonne", "L", "mL", "pcs", "box", "pack", "dozen", "bundle", "roll")
        ),
        BusinessVertical(
            SALON,
            "Salon, barber & beauty services",
            listOf("Hair Services", "Hair Care Products", "Skin Care", "Nail Care", "Cosmetics", "Salon Equipment", "Consumables", "Beauty Packages", "Other"),
            listOf("service", "session", "appointment", "pcs", "unit", "bottle", "tube", "jar", "pack", "set", "mL", "L", "g", "kg")
        )
    )

    fun normalize(vertical: String?): String =
        vertical?.trim()?.lowercase()?.takeIf { key -> verticals.any { it.key == key } } ?: GENERAL_RETAIL

    fun categoriesForShop(vertical: String?): List<String> =
        verticals.first { it.key == normalize(vertical) }.categories

    fun unitsForShop(vertical: String?, existingUnit: String = ""): List<String> {
        val verticalUnits = verticals.first { it.key == normalize(vertical) }.units
        return (verticalUnits + commonUnits + existingUnit.trim().takeIf { it.isNotEmpty() }.orEmpty())
            .filter { it.isNotBlank() }
            .distinctBy { it.lowercase() }
    }

    fun defaultUnit(vertical: String?): String =
        when (normalize(vertical)) {
            PHARMACY -> "pack"
            HARDWARE -> "pcs"
            RESTAURANT -> "portion"
            WHOLESALE -> "carton"
            SALON -> "service"
            else -> "pcs"
        }

    fun categoriesWithExisting(vertical: String?, existing: List<String>): List<String> =
        (categoriesForShop(vertical) + existing.map { it.trim() })
            .filter { it.isNotBlank() }
            .distinctBy { it.lowercase() }
            .sorted()
}
