package de.laufheld.app

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Liefert jede Sekunde die GPS-Position, die aktuelle Geschwindigkeit (m/s)
 * und die insgesamt gelaufene Strecke (m). Die Ergebnisse kommen auf dem Main-Thread an.
 */
class LocationTracker(
    context: Context,
    private val onUpdate: (location: Location, speedMps: Float, distanceMeters: Float, goodFix: Boolean) -> Unit,
) {
    private val client = LocationServices.getFusedLocationProviderClient(context)
    private val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
        .setMinUpdateIntervalMillis(500L)
        .build()

    private var lastGoodFix: Location? = null
    private var smoothSpeed = 0f
    private var totalDistance = 0f
    private var running = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(::handleLocation)
        }
    }

    /** Darf nur aufgerufen werden, wenn die Standort-Erlaubnis erteilt ist. */
    @SuppressLint("MissingPermission")
    fun start() {
        if (running) return
        running = true
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    fun stop() {
        if (!running) return
        running = false
        client.removeLocationUpdates(callback)
    }

    private fun handleLocation(location: Location) {
        val goodFix = location.hasAccuracy() && location.accuracy <= MAX_ACCURACY_METERS
        val previous = lastGoodFix

        // Die meisten Handys liefern die Geschwindigkeit direkt aus dem GPS (am genauesten).
        var rawSpeed: Float? = if (location.hasSpeed()) location.speed else null

        if (goodFix) {
            if (previous == null) {
                lastGoodFix = location
            } else {
                val meters = previous.distanceTo(location)
                val seconds = (location.elapsedRealtimeNanos - previous.elapsedRealtimeNanos) / 1_000_000_000f
                if (rawSpeed == null && seconds > 0f) rawSpeed = meters / seconds
                // Kleine Sprünge sind meist GPS-Zittern, die zählen nicht als Strecke
                if (meters >= MIN_STEP_METERS) {
                    totalDistance += meters
                    lastGoodFix = location
                }
            }
        }

        if (rawSpeed != null) {
            smoothSpeed += (rawSpeed.coerceIn(0f, MAX_SPEED_MPS) - smoothSpeed) * SMOOTHING
        }
        val speed = if (smoothSpeed < STANDING_SPEED_MPS) 0f else smoothSpeed

        onUpdate(location, speed, totalDistance, goodFix)
    }

    companion object {
        private const val MAX_ACCURACY_METERS = 30f
        private const val MIN_STEP_METERS = 3f
        private const val MAX_SPEED_MPS = 12f
        private const val STANDING_SPEED_MPS = 0.4f
        private const val SMOOTHING = 0.5f
    }
}
