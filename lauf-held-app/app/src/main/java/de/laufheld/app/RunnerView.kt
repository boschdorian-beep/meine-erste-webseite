package de.laufheld.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Das Jump & Run: Die Figur läuft so schnell wie du in echt (GPS) und springt, wenn du springst.
 *
 * - Bodenmünzen sammelt man einfach durchs Laufen ein
 * - Luftmünzen erreicht man nur mit einem echten Sprung
 * - Diamanten hängen ganz oben, dafür braucht man einen richtig hohen Sprung
 * - Kisten muss man überspringen, sonst stolpert man und verliert Punkte
 *
 * Je schneller du läufst, desto mehr Punkte gibt jede Münze (Gehen ×1, Joggen ×2, Sprinten ×3).
 * Tippen auf das Spiel löst einen Testsprung aus.
 */
class RunnerView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private enum class Level(val label: String, val multiplier: Int, val skyTop: Int, val skyBottom: Int) {
        STANDING("Du stehst still", 0, Color.rgb(40, 52, 80), Color.rgb(90, 110, 150)),
        WALKING("Gehen", 1, Color.rgb(70, 150, 230), Color.rgb(170, 215, 250)),
        JOGGING("Joggen", 2, Color.rgb(255, 140, 60), Color.rgb(255, 210, 130)),
        SPRINTING("Sprinten!", 3, Color.rgb(200, 40, 90), Color.rgb(255, 140, 90)),
    }

    private enum class ItemType { GROUND_COIN, AIR_COIN, DIAMOND, CRATE }

    private class Item(val type: ItemType, val worldX: Float, val height: Float, val size: Float) {
        var done = false
    }

    private class FloatingText(val text: String, val x: Float, var y: Float, val color: Int) {
        var age = 0f
    }

    private val density = resources.displayMetrics.density
    private val prefs = context.getSharedPreferences("lauf_held", Context.MODE_PRIVATE)

    // Daten vom GPS
    private var speedMps = 0f
    private var lastGpsUpdate = 0L
    private var distanceMeters = 0f
    private var hasGoodFix = false
    private var message: String? = null

    // Spielzustand
    private var score = 0
    private var best = prefs.getInt(KEY_BEST, 0)
    private var worldX = 0f
    private var nextSpawnX = 0f
    private var spawnStarted = false
    private var playerHeight = 0f
    private var playerVy = 0f
    private var runPhase = 0f
    private var gameTime = 0f
    private var stumbleUntil = 0f
    private var level = Level.STANDING
    private var lastFrameNanos = 0L
    private val items = mutableListOf<Item>()
    private val floatingTexts = mutableListOf<FloatingText>()

    private val pxPerMeter = 60f * density
    private val gravity = 1800f * density
    private val jumpBase = 110f * density
    private val playerHeightPx = 56f * density
    private val groundY get() = height * 0.8f
    private val playerScreenX get() = width * 0.25f

    private val skyPaint = Paint()
    private var skyLevel: Level? = null
    private val groundPaint = Paint().apply { color = Color.rgb(76, 140, 60) }
    private val dirtPaint = Paint().apply { color = Color.rgb(110, 80, 50) }
    private val stripePaint = Paint().apply { color = Color.rgb(64, 120, 50) }
    private val hillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(90, 255, 255, 255) }
    private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(255, 201, 64)
        strokeWidth = 6f * density
        strokeCap = Paint.Cap.ROUND
        style = Paint.Style.STROKE
    }
    private val headPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(255, 201, 64) }
    private val eyePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(16, 24, 40) }
    private val coinPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(255, 201, 64) }
    private val coinRimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(180, 120, 0)
        style = Paint.Style.STROKE
        strokeWidth = 2.5f * density
    }
    private val diamondPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(80, 220, 255) }
    private val cratePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(160, 100, 45) }
    private val crateLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(100, 60, 25)
        style = Paint.Style.STROKE
        strokeWidth = 3f * density
    }
    private val speedLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(120, 255, 255, 255)
        strokeWidth = 2f * density
    }
    private val hudBigPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 30f * density
        isFakeBoldText = true
        setShadowLayer(4f * density, 0f, 0f, Color.BLACK)
    }
    private val hudPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 17f * density
        isFakeBoldText = true
        setShadowLayer(3f * density, 0f, 0f, Color.BLACK)
    }
    private val hudRightPaint = Paint(hudPaint).apply { textAlign = Paint.Align.RIGHT }
    private val floatPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 20f * density
        isFakeBoldText = true
        textAlign = Paint.Align.CENTER
        setShadowLayer(3f * density, 0f, 0f, Color.BLACK)
    }
    private val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(215, 16, 24, 40) }
    private val boxTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 16f * density
        textAlign = Paint.Align.CENTER
    }

    private val path = Path()
    private val rect = RectF()

    // ---------------------------------------------------------------- Eingaben

    fun updateGps(speed: Float, distance: Float, goodFix: Boolean) {
        speedMps = speed
        distanceMeters = distance
        hasGoodFix = hasGoodFix || goodFix
        lastGpsUpdate = SystemClock.elapsedRealtime()
    }

    fun setMessage(text: String?) {
        message = text
        invalidate()
    }

    /** Ein echter Sprung: je länger in der Luft, desto höher springt die Figur. */
    fun jump(airtimeSeconds: Float) {
        if (playerHeight > 4f * density) return
        val factor = (airtimeSeconds / 0.35f).coerceIn(0.6f, 1.8f)
        playerVy = sqrt(2f * gravity * jumpBase * factor)
        val label = when {
            factor >= 1.4f -> "Mega-Sprung!"
            factor >= 1.0f -> "Guter Sprung!"
            else -> "Hopser"
        }
        floatingTexts.add(FloatingText(label, playerScreenX, groundY - playerHeightPx - 20f * density, Color.WHITE))
    }

    /** Eine Münze auf der Google-Maps-Karte wurde eingesammelt. */
    fun onMapCoin() {
        val points = 10 * max(level.multiplier, 1)
        addScore(points)
        floatingTexts.add(FloatingText("Karten-Münze +$points", width / 2f, height * 0.35f, Color.rgb(255, 225, 90)))
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            jump(0.35f)
            return true
        }
        return super.onTouchEvent(event)
    }

    // ---------------------------------------------------------------- Spiellogik

    private fun currentSpeed(): Float {
        // Kommen länger keine GPS-Daten, gilt man als stehend
        val stale = SystemClock.elapsedRealtime() - lastGpsUpdate > 4000L
        return if (stale) 0f else speedMps
    }

    private fun levelFor(speed: Float) = when {
        speed < 0.5f -> Level.STANDING
        speed < 2.2f -> Level.WALKING   // bis ca. 8 km/h
        speed < 4.0f -> Level.JOGGING   // bis ca. 14 km/h
        else -> Level.SPRINTING
    }

    private fun addScore(points: Int) {
        score = max(0, score + points)
        if (score > best) {
            best = score
            prefs.edit().putInt(KEY_BEST, best).apply()
        }
    }

    private fun update(dt: Float) {
        gameTime += dt
        val speed = currentSpeed()
        level = levelFor(speed)

        var scroll = speed * pxPerMeter
        if (gameTime < stumbleUntil) scroll *= 0.4f
        worldX += scroll * dt
        runPhase += dt * (if (speed > 0f) 3f + speed * 2.2f else 0f)

        // Sprung-Physik
        if (playerHeight > 0f || playerVy > 0f) {
            playerVy -= gravity * dt
            playerHeight += playerVy * dt
            if (playerHeight <= 0f) {
                playerHeight = 0f
                playerVy = 0f
            }
        }

        // Neue Gegenstände rechts außerhalb des Bildschirms erzeugen (die ersten erst ein paar Meter voraus)
        if (!spawnStarted) {
            spawnStarted = true
            nextSpawnX = worldX + 4f * pxPerMeter
        }
        while (nextSpawnX < worldX + width) {
            spawnItem(nextSpawnX)
            nextSpawnX += (3f + Random.nextFloat() * 5f) * pxPerMeter
        }

        val playerBottom = playerHeight
        val playerTop = playerHeight + playerHeightPx
        val iterator = items.iterator()
        while (iterator.hasNext()) {
            val item = iterator.next()
            val screenX = screenXOf(item)
            if (screenX < -item.size * 2) {
                iterator.remove()
                continue
            }
            // Kisten haben ein schmaleres Trefferfenster, damit man sie auch beim langsamen Gehen überspringen kann
            val reach = if (item.type == ItemType.CRATE) item.size / 2f else item.size / 2f + 12f * density
            if (item.done || abs(screenX - playerScreenX) > reach) continue

            when (item.type) {
                ItemType.CRATE -> if (playerBottom < item.size * 0.8f) {
                    item.done = true
                    stumbleUntil = gameTime + 1.5f
                    addScore(-3)
                    floatingTexts.add(FloatingText("Gestolpert! −3", playerScreenX, groundY - playerTop, Color.rgb(255, 120, 120)))
                }
                else -> if (item.height + item.size / 2f > playerBottom && item.height - item.size / 2f < playerTop) {
                    item.done = true
                    val base = when (item.type) {
                        ItemType.DIAMOND -> 5
                        ItemType.AIR_COIN -> 2
                        else -> 1
                    }
                    val points = base * max(level.multiplier, 1)
                    addScore(points)
                    floatingTexts.add(FloatingText("+$points", screenX, groundY - item.height, Color.rgb(255, 225, 90)))
                }
            }
        }

        val textIterator = floatingTexts.iterator()
        while (textIterator.hasNext()) {
            val text = textIterator.next()
            text.age += dt
            text.y -= 40f * density * dt
            if (text.age > 1.5f) textIterator.remove()
        }
    }

    private fun spawnItem(worldX: Float) {
        val roll = Random.nextFloat()
        items += when {
            roll < 0.25f -> Item(ItemType.CRATE, worldX, 0f, 30f * density)
            roll < 0.55f -> Item(ItemType.GROUND_COIN, worldX, 22f * density, 22f * density)
            roll < 0.85f -> Item(ItemType.AIR_COIN, worldX, (95f + Random.nextFloat() * 30f) * density, 22f * density)
            else -> Item(ItemType.DIAMOND, worldX, 195f * density, 24f * density)
        }
    }

    private fun screenXOf(item: Item) = playerScreenX + (item.worldX - worldX)

    // ---------------------------------------------------------------- Zeichnen

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val now = System.nanoTime()
        val dt = if (lastFrameNanos == 0L) 0f else ((now - lastFrameNanos) / 1_000_000_000f).coerceAtMost(0.05f)
        lastFrameNanos = now
        update(dt)

        drawBackground(canvas)
        for (item in items) if (!item.done) drawItem(canvas, item)
        drawPlayer(canvas)
        drawFloatingTexts(canvas)
        drawHud(canvas)
        drawMessages(canvas)

        postInvalidateOnAnimation()
    }

    private fun drawBackground(canvas: Canvas) {
        if (skyLevel != level) {
            skyLevel = level
            skyPaint.shader = LinearGradient(0f, 0f, 0f, groundY, level.skyTop, level.skyBottom, Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width.toFloat(), groundY, skyPaint)

        // Hügel im Hintergrund bewegen sich langsamer (Parallaxe)
        val hillWidth = 260f * density
        val offset = (worldX * 0.2f) % hillWidth
        var x = -offset - hillWidth
        while (x < width + hillWidth) {
            rect.set(x, groundY - 70f * density, x + hillWidth, groundY + 70f * density)
            canvas.drawOval(rect, hillPaint)
            x += hillWidth * 0.9f
        }

        canvas.drawRect(0f, groundY, width.toFloat(), height.toFloat(), dirtPaint)
        canvas.drawRect(0f, groundY, width.toFloat(), groundY + 14f * density, groundPaint)
        val stripeWidth = 40f * density
        var sx = -(worldX % (stripeWidth * 2))
        while (sx < width) {
            canvas.drawRect(sx, groundY, sx + stripeWidth, groundY + 14f * density, stripePaint)
            sx += stripeWidth * 2
        }

        // Beim Sprinten Speed-Linien
        if (level == Level.SPRINTING) {
            for (i in 0 until 8) {
                val y = groundY * (0.15f + 0.1f * i)
                val len = 60f * density
                val lx = width - ((gameTime * 900f * density + i * 137f * density) % (width + len))
                canvas.drawLine(lx, y, lx + len, y, speedLinePaint)
            }
        }
    }

    private fun drawItem(canvas: Canvas, item: Item) {
        val x = screenXOf(item)
        val y = groundY - item.height
        val r = item.size / 2f
        when (item.type) {
            ItemType.CRATE -> {
                rect.set(x - r, groundY - item.size, x + r, groundY)
                canvas.drawRect(rect, cratePaint)
                canvas.drawRect(rect, crateLinePaint)
                canvas.drawLine(rect.left, rect.top, rect.right, rect.bottom, crateLinePaint)
                canvas.drawLine(rect.right, rect.top, rect.left, rect.bottom, crateLinePaint)
            }
            ItemType.DIAMOND -> {
                val bob = sin(gameTime * 4f) * 4f * density
                path.reset()
                path.moveTo(x, y - r + bob)
                path.lineTo(x + r, y + bob)
                path.lineTo(x, y + r + bob)
                path.lineTo(x - r, y + bob)
                path.close()
                canvas.drawPath(path, diamondPaint)
            }
            else -> {
                // Münze "dreht" sich, indem sie schmaler und breiter wird
                val squash = 0.35f + 0.65f * abs(sin(gameTime * 3f + item.worldX))
                rect.set(x - r * squash, y - r, x + r * squash, y + r)
                canvas.drawOval(rect, coinPaint)
                canvas.drawOval(rect, coinRimPaint)
            }
        }
    }

    private fun drawPlayer(canvas: Canvas) {
        // Beim Stolpern blinkt die Figur
        if (gameTime < stumbleUntil && ((gameTime * 10).toInt() % 2 == 0)) return

        val x = playerScreenX
        val feetY = groundY - playerHeight
        val hipY = feetY - 22f * density
        val shoulderY = hipY - 18f * density
        val headR = 9f * density
        val headY = shoulderY - headR - 2f * density

        val inAir = playerHeight > 0f
        val swing = if (inAir) 0.6f else sin(runPhase)
        val stride = 12f * density

        // Beine
        if (inAir) {
            canvas.drawLine(x, hipY, x + 10f * density, hipY + 8f * density, bodyPaint)
            canvas.drawLine(x + 10f * density, hipY + 8f * density, x + 2f * density, feetY - 4f * density, bodyPaint)
            canvas.drawLine(x, hipY, x - 8f * density, hipY + 12f * density, bodyPaint)
            canvas.drawLine(x - 8f * density, hipY + 12f * density, x - 14f * density, feetY - 2f * density, bodyPaint)
        } else {
            canvas.drawLine(x, hipY, x + swing * stride, feetY, bodyPaint)
            canvas.drawLine(x, hipY, x - swing * stride, feetY, bodyPaint)
        }
        // Körper und Arme
        canvas.drawLine(x, hipY, x + 3f * density, shoulderY, bodyPaint)
        val armSwing = if (inAir) -1f else -swing
        canvas.drawLine(x + 3f * density, shoulderY + 3f * density, x + 3f * density + armSwing * stride, shoulderY + 14f * density, bodyPaint)
        canvas.drawLine(x + 3f * density, shoulderY + 3f * density, x + 3f * density - armSwing * stride, shoulderY + 14f * density, bodyPaint)
        // Kopf
        canvas.drawCircle(x + 4f * density, headY, headR, headPaint)
        canvas.drawCircle(x + 8f * density, headY - 2f * density, 1.8f * density, eyePaint)
    }

    private fun drawFloatingTexts(canvas: Canvas) {
        for (text in floatingTexts) {
            floatPaint.color = text.color
            floatPaint.alpha = ((1f - text.age / 1.5f).coerceIn(0f, 1f) * 255).toInt()
            canvas.drawText(text.text, text.x, text.y, floatPaint)
        }
    }

    private fun drawHud(canvas: Canvas) {
        val pad = 14f * density
        val kmh = currentSpeed() * 3.6f
        canvas.drawText(String.format(Locale.GERMANY, "%.1f km/h", kmh), pad, pad + 28f * density, hudBigPaint)
        val multiplierText = if (level.multiplier > 0) "  ×${level.multiplier}" else ""
        canvas.drawText(level.label + multiplierText, pad, pad + 52f * density, hudPaint)

        val right = width - pad
        canvas.drawText("Punkte: $score", right, pad + 22f * density, hudRightPaint)
        canvas.drawText("Rekord: $best", right, pad + 44f * density, hudRightPaint)
        canvas.drawText(String.format(Locale.GERMANY, "%.2f km", distanceMeters / 1000f), right, pad + 66f * density, hudRightPaint)
    }

    private fun drawMessages(canvas: Canvas) {
        val lines = when {
            message != null -> message!!.split("\n")
            !hasGoodFix -> listOf("Warte auf GPS-Signal …", "Am besten draußen spielen.")
            gameTime < 8f -> listOf("Achte beim Laufen auf den Verkehr!", "Spring echt hoch, um Luftmünzen zu holen.")
            else -> return
        }
        val lineHeight = boxTextPaint.textSize * 1.4f
        val boxH = lines.size * lineHeight + 20f * density
        val boxW = width * 0.9f
        val top = height * 0.42f - boxH / 2f
        rect.set(width / 2f - boxW / 2f, top, width / 2f + boxW / 2f, top + boxH)
        canvas.drawRoundRect(rect, 14f * density, 14f * density, boxPaint)
        var y = top + 10f * density + lineHeight * 0.8f
        for (line in lines) {
            canvas.drawText(line, width / 2f, y, boxTextPaint)
            y += lineHeight
        }
    }

    companion object {
        private const val KEY_BEST = "best_score"
    }
}
