package de.laufheld.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.location.Location
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.Polyline
import com.google.android.gms.maps.model.PolylineOptions
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Der Karten-Teil: zeigt die gelaufene Strecke und verteilt Münzen in der echten Umgebung.
 * Läuft man bis auf [COLLECT_RADIUS_METERS] an eine Münze heran, wird sie eingesammelt.
 */
class MapGame(
    private val map: GoogleMap,
    density: Float,
    private val onCoinCollected: () -> Unit,
) {
    private val routePoints = mutableListOf<LatLng>()
    private val route: Polyline = map.addPolyline(
        PolylineOptions()
            .color(Color.rgb(46, 125, 255))
            .width(6f * density)
    )
    private val coins = mutableListOf<Marker>()
    private val coinIcon: BitmapDescriptor = BitmapDescriptorFactory.fromBitmap(createCoinBitmap(density))
    private var cameraPlaced = false

    fun onLocation(location: Location, goodFix: Boolean) {
        val position = LatLng(location.latitude, location.longitude)

        if (cameraPlaced) {
            map.animateCamera(CameraUpdateFactory.newLatLng(position))
        } else {
            map.moveCamera(CameraUpdateFactory.newLatLngZoom(position, 17f))
            cameraPlaced = true
        }

        // Ungenaue Positionen nicht für Strecke und Münzen verwenden
        if (!goodFix) return

        routePoints.add(position)
        route.points = routePoints

        val iterator = coins.iterator()
        while (iterator.hasNext()) {
            val coin = iterator.next()
            val distance = distanceMeters(position, coin.position)
            if (distance <= COLLECT_RADIUS_METERS || distance > FORGET_RADIUS_METERS) {
                coin.remove()
                iterator.remove()
                if (distance <= COLLECT_RADIUS_METERS) onCoinCollected()
            }
        }

        while (coins.size < COIN_COUNT) {
            val marker = map.addMarker(
                MarkerOptions()
                    .position(randomPointNear(position))
                    .icon(coinIcon)
                    .anchor(0.5f, 0.5f)
                    .title("Münze")
            ) ?: break
            coins.add(marker)
        }
    }

    private fun randomPointNear(center: LatLng): LatLng {
        val meters = MIN_COIN_DISTANCE + Random.nextDouble() * (MAX_COIN_DISTANCE - MIN_COIN_DISTANCE)
        val bearing = Random.nextDouble() * 2 * Math.PI
        val metersPerDegree = 111_320.0
        val dLat = meters * cos(bearing) / metersPerDegree
        val dLng = meters * sin(bearing) / (metersPerDegree * cos(Math.toRadians(center.latitude)))
        return LatLng(center.latitude + dLat, center.longitude + dLng)
    }

    private fun distanceMeters(a: LatLng, b: LatLng): Float {
        val result = FloatArray(1)
        Location.distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude, result)
        return result[0]
    }

    private fun createCoinBitmap(density: Float): Bitmap {
        val size = (28 * density).toInt()
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val c = size / 2f
        paint.color = Color.rgb(180, 120, 0)
        canvas.drawCircle(c, c, c, paint)
        paint.color = Color.rgb(255, 201, 64)
        canvas.drawCircle(c, c, c * 0.82f, paint)
        paint.color = Color.rgb(180, 120, 0)
        paint.textSize = c * 1.1f
        paint.textAlign = Paint.Align.CENTER
        paint.isFakeBoldText = true
        canvas.drawText("★", c, c + paint.textSize * 0.36f, paint)
        return bitmap
    }

    companion object {
        private const val COIN_COUNT = 6
        private const val MIN_COIN_DISTANCE = 40.0
        private const val MAX_COIN_DISTANCE = 160.0
        private const val COLLECT_RADIUS_METERS = 20f
        private const val FORGET_RADIUS_METERS = 400f
    }
}
