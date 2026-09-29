package de.laufheld.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment

class MainActivity : AppCompatActivity(), OnMapReadyCallback {

    private lateinit var runnerView: RunnerView
    private lateinit var locationTracker: LocationTracker
    private lateinit var jumpDetector: JumpDetector
    private var googleMap: GoogleMap? = null
    private var mapGame: MapGame? = null

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            if (result.values.any { it }) {
                onLocationPermissionGranted()
            } else {
                runnerView.setMessage(getString(R.string.no_permission))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Bildschirm bleibt beim Laufen an
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        runnerView = findViewById(R.id.runnerView)

        locationTracker = LocationTracker(this) { location, speed, distance, goodFix ->
            runnerView.updateGps(speed, distance, goodFix)
            mapGame?.onLocation(location, goodFix)
        }
        jumpDetector = JumpDetector(this) { airtime -> runnerView.jump(airtime) }

        setUpMap(savedInstanceState)

        if (hasLocationPermission()) {
            onLocationPermissionGranted()
        } else {
            permissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    private fun setUpMap(savedInstanceState: Bundle?) {
        // Ohne Schlüssel würde Google Maps abstürzen, deshalb dann nur einen Hinweis zeigen
        if (!hasMapsKey()) {
            findViewById<TextView>(R.id.mapHint).visibility = View.VISIBLE
            return
        }
        val fragment = if (savedInstanceState == null) {
            SupportMapFragment.newInstance().also {
                supportFragmentManager.beginTransaction().add(R.id.mapContainer, it, MAP_TAG).commitNow()
            }
        } else {
            supportFragmentManager.findFragmentByTag(MAP_TAG) as SupportMapFragment
        }
        fragment.getMapAsync(this)
    }

    override fun onMapReady(map: GoogleMap) {
        googleMap = map
        map.uiSettings.isMyLocationButtonEnabled = false
        mapGame = MapGame(map, resources.displayMetrics.density) { runnerView.onMapCoin() }
        if (hasLocationPermission()) enableMyLocationDot()
    }

    private fun onLocationPermissionGranted() {
        runnerView.setMessage(null)
        locationTracker.start()
        enableMyLocationDot()
    }

    @SuppressLint("MissingPermission")
    private fun enableMyLocationDot() {
        googleMap?.isMyLocationEnabled = true
    }

    override fun onResume() {
        super.onResume()
        jumpDetector.start()
        if (hasLocationPermission()) locationTracker.start()
    }

    override fun onPause() {
        super.onPause()
        jumpDetector.stop()
        locationTracker.stop()
    }

    private fun hasLocationPermission(): Boolean =
        listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).any {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }

    private fun hasMapsKey(): Boolean {
        val info = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
        return !info.metaData?.getString("com.google.android.geo.API_KEY").isNullOrBlank()
    }

    companion object {
        private const val MAP_TAG = "map"
    }
}
