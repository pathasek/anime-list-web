import { useState, useEffect } from 'react'
import { getDataVersion } from './dataStore'

// Sdílený příslib: custom_images.json se stáhne a naparsuje jen jednou za
// session, i když hook useCustomImages použije víc stránek. Stabilní verzní
// parametr (místo Date.now()) navíc pustí HTTP cache při F5.
let _configPromise = null
function loadCustomImages() {
  if (!_configPromise) {
    _configPromise = getDataVersion()
      .then(v => fetch(`data/custom_images.json?v=${v}`))
      .then(r => r.json())
      .catch(() => ({ page_backgrounds: {}, custom_images: [] }))
  }
  return _configPromise
}

/**
 * Hook to load custom image configuration from custom_images.json.
 * Returns the full config object with page_backgrounds and custom_images arrays.
 */
export function useCustomImages() {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    let alive = true
    loadCustomImages().then(c => { if (alive) setConfig(c) })
    return () => { alive = false }
  }, [])

  return config
}

/**
 * Get the background config for a specific page location.
 * @param {object} config - The full custom images config
 * @param {string} key - The page_backgrounds key (e.g. 'ratings_split_left')
 * @returns {object|null} - { src, opacity, position, size, label } or null
 */
export function getPageBackground(config, key) {
  if (!config || !config.page_backgrounds) return null
  return config.page_backgrounds[key] || null
}
