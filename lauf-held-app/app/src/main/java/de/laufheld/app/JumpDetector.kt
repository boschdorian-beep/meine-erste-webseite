package de.laufheld.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Erkennt echte Sprünge mit dem Beschleunigungssensor.
 *
 * Während man in der Luft ist, ist man im freien Fall: Der Sensor misst dann fast 0 g.
 * Die Dauer dieser Phase ist die Flugzeit. Je länger die Flugzeit, desto höher war der Sprung.
 * Beim normalen Laufen ist man nur ganz kurz in der Luft, deshalb gibt es eine Mindest-Flugzeit.
 */
class JumpDetector(
    context: Context,
    private val onJump: (airtimeSeconds: Float) -> Unit,
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    private var inFreeFall = false
    private var freeFallStartNanos = 0L
    private var lastJumpNanos = 0L

    fun start() {
        accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        inFreeFall = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val g = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH

        if (g < FREE_FALL_G) {
            if (!inFreeFall) {
                inFreeFall = true
                freeFallStartNanos = event.timestamp
            }
        } else if (inFreeFall) {
            // Landung: Flugzeit auswerten
            inFreeFall = false
            val airtime = (event.timestamp - freeFallStartNanos) / 1_000_000_000f
            val sinceLastJump = (event.timestamp - lastJumpNanos) / 1_000_000_000f
            if (airtime in MIN_AIRTIME..MAX_AIRTIME && sinceLastJump > COOLDOWN_SECONDS) {
                lastJumpNanos = event.timestamp
                onJump(airtime)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    companion object {
        private const val FREE_FALL_G = 0.5f
        private const val MIN_AIRTIME = 0.18f
        // Länger als 1,2 s in der Luft ist kein Sprung mehr, sondern ein fallendes Handy
        private const val MAX_AIRTIME = 1.2f
        private const val COOLDOWN_SECONDS = 0.5f
    }
}
