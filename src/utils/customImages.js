import { useState, useEffect } from 'react'

/**
 * Hook to load custom image configuration from custom_images.json.
 * Returns the full config object with page_backgrounds and custom_images arrays.
 */
export function useCustomImages() {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    fetch('data/custom_images.json?v=' + Date.now())
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ page_backgrounds: {}, custom_images: [] }))
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
