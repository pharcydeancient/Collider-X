import { useEffect, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { cachePoster, overlayFor, playerSource, useMediaCatalog, type MediaAsset, type ResolvedAsset } from './useMediaCatalog'

type Props = {
  supabaseUrl: string
  supabaseAnonKey: string
  assetId?: string
  unlockedPremiumIds?: string[]
  reduceMotion?: boolean
  lowPower?: boolean
  wifi?: boolean
}

export function LiveLayer(props: Props) {
  const catalog = useMediaCatalog(props)
  const [resolved, setResolved] = useState<ResolvedAsset | null>(null)
  const [posterLocal, setPosterLocal] = useState<string | null>(null)
  const row: MediaAsset | undefined = props.assetId
    ? catalog.rows.find((r) => r.id === props.assetId)
    : catalog.rows.find((r) => r.kind === 'live' || r.kind === 'still')

  useEffect(() => {
    if (!row) return
    let cancelled = false
    catalog.resolveOne(row).then(async (r) => {
      if (cancelled) return
      setResolved(r)
      if (r.posterUrl) {
        const local = await cachePoster(r.posterUrl, r.id)
        if (!cancelled) setPosterLocal(local)
      }
    })
    return () => { cancelled = true }
  }, [row?.id, props.wifi, props.reduceMotion, props.lowPower, props.unlockedPremiumIds])

  if (!row) return null
  const overlay = overlayFor(row, props.unlockedPremiumIds ?? [])
  const src = resolved ? playerSource(resolved) : null
  const canPlay = Boolean(resolved?.shouldFetchStream && resolved.kind === 'live' && src)

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {posterLocal ? <Image source={{ uri: posterLocal }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {canPlay ? (
        <Video source={src!} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.COVER} shouldPlay isLooping isMuted posterSource={posterLocal ? { uri: posterLocal } : undefined} usePoster />
      ) : null}
      {overlay !== 'none' ? (
        <View style={[StyleSheet.absoluteFill, overlay === 'dim' && styles.dim, overlay === 'mist' && styles.mist, overlay === 'smoke' && styles.smoke]} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.42)' },
  mist: { backgroundColor: 'rgba(210,220,230,0.22)' },
  smoke: { backgroundColor: 'rgba(20,18,16,0.38)' },
})
