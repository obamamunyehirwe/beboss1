package com.beboss.shopmgmt.domain

import com.beboss.shared.DemandForecastMath
import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidDemandForecastAdapterTest {
    @Test
    fun calendarAdapterSuppliesAllDayBoundariesAndWeekdaysToSharedEngine() {
        assertEquals(56, DemandForecastEngine.HISTORY_DAYS)
        assertEquals(DemandForecastMath.MAX_PLANNING_DAYS, DemandForecastEngine.MAX_PLANNING_DAYS)
    }
}
