package com.gooley.storybook.ui.reader

import android.media.MediaPlayer
import android.util.Log
import com.gooley.storybook.data.model.PageAudio

class AudioManager {
    private var ambientPlayer: MediaPlayer? = null
    private var sfxPlayer: MediaPlayer? = null
    private var currentAmbientPath: String? = null

    fun playAmbient(audio: PageAudio?) {
        val path = audio?.audioPath
        if (path == null) {
            stopAmbient()
            return
        }
        if (path == currentAmbientPath) return

        stopAmbient()
        try {
            ambientPlayer = MediaPlayer().apply {
                setDataSource(path)
                isLooping = true
                setVolume(0.5f, 0.5f)
                prepare()
                start()
            }
            currentAmbientPath = path
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play ambient: ${e.message}")
        }
    }

    fun playSfx(audioList: List<PageAudio>) {
        if (audioList.isEmpty()) return
        stopSfx()
        // Duck ambient volume while SFX plays
        ambientPlayer?.setVolume(0.2f, 0.2f)
        playSfxSequence(audioList, 0)
    }

    private fun playSfxSequence(audioList: List<PageAudio>, index: Int) {
        if (index >= audioList.size) {
            // Restore ambient volume when all SFX done
            ambientPlayer?.setVolume(0.5f, 0.5f)
            return
        }
        val path = audioList[index].audioPath
        if (path == null) {
            // Skip entries with no local file, continue to next
            playSfxSequence(audioList, index + 1)
            return
        }

        try {
            sfxPlayer = MediaPlayer().apply {
                setDataSource(path)
                setVolume(0.8f, 0.8f)
                setOnCompletionListener {
                    it.release()
                    playSfxSequence(audioList, index + 1)
                }
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play SFX: ${e.message}")
            ambientPlayer?.setVolume(0.5f, 0.5f)
        }
    }

    private fun stopAmbient() {
        ambientPlayer?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        ambientPlayer = null
        currentAmbientPath = null
    }

    private fun stopSfx() {
        sfxPlayer?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        sfxPlayer = null
    }

    fun stopAll() {
        stopAmbient()
        stopSfx()
    }

    fun release() {
        stopAll()
    }

    companion object {
        private const val TAG = "AudioManager"
    }
}
