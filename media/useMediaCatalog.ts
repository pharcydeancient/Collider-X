import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type MediaKind = 'still' | 'live' | 'audio'
export type Motion = 'none' | 'subtle' | 'weather'
export type LockedTreatment = 'dim' | 'mist' | 'smoke' | 'none'

export type MediaAsset = {
  id: string
  kind: MediaKind
  category: string
  title: string
  poster_path: string | null
  stream_path: string
  hi_path: string | null
  duration_ms: number | null
  loopable: boolean
  motion: Motion
  energy: number | null
  bpm: number | null
  license: string | null
  premium: boolean
  locked_treatment: LockedTreatment
  sort: number
}

export type ResolvedAsset = MediaAsset & {
  posterUrl: string | null
  streamUrl: string | null
  hiUrl: string | null
  shouldFetchStream: boolean
}

type Options = {
  supabaseUrl: string
  supabaseAnonKey: string
  publicBucket?: string
  premiumBucket?: string
  signedTtlSec?: number
  reduceMotion?: boolean
  lowPower?: boolean
  wifi?: boolean
  unlockedPremiumIds?: string[]
}

function isUnlocked(asset: MediaAsset, unlocked: Set<string>) {
  return !asset.premium || unlocked.has(asset.id)
}

export function useMediaCatalog(opts: Options) {
  const publicBucket = opts.publicBucket ?? 'media-public'
  const premiumBucket = opts.premiumBucket ?? 'media-premium'
  const ttl = opts.signedTtlSec ?? 60 * 60 * 12
  const unlocked = useMemo(() => new Set(opts.unlockedPremiumIds ?? []), [opts.unlockedPremiumIds])
  const clientRef = useRef<SupabaseClient | null>(null)
  if (!clientRef.current) clientRef.current = createClient(opts.supabaseUrl, opts.supabaseAnonKey)
  const supabase = clientRef.current
  const signedCache = useRef<Map<string, { url: string; exp: number }>>(new Map())
  const [rows, setRows] = useState<MediaAsset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const publicUrl = useCallback((path: string | null) => {
    if (!path) return null
    return supabase.storage.from(publicBucket).getPublicUrl(path).data.publicUrl
  }, [supabase, publicBucket])

  const signedUrl = useCallback(async (path: string) => {
    const now = Date.now()
    const hit = signedCache.current.get(path)
    if (hit && hit.exp - now > 60_000) return hit.url
    const { data, error: signErr } = await supabase.storage.from(premiumBucket).createSignedUrl(path, ttl)
    if (signErr || !data?.signedUrl) throw signErr ?? new Error('sign failed')
    signedCache.current.set(path, { url: data.signedUrl, exp: now + ttl * 1000 })
    return data.signedUrl
  }, [supabase, premiumBucket, ttl])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: qErr } = await supabase.from('media_assets').select('id,kind,category,title,poster_path,stream_path,hi_path,duration_ms,loopable,motion,energy,bpm,license,premium,locked_treatment,sort').eq('active', true).order('sort', { ascending: true })
    if (qErr) { setError(qErr.message); setLoading(false); return }
    setRows((data ?? []) as MediaAsset[])
    setError(null)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const resolveOne = useCallback(async (asset: MediaAsset): Promise<ResolvedAsset> => {
    const free = !asset.premium
    const unlockedNow = isUnlocked(asset, unlocked)
    const posterUrl = asset.poster_path ? (publicUrl(asset.poster_path) ?? (asset.premium ? await signedUrl(asset.poster_path).catch(() => null) : null)) : null
    const allowStream = unlockedNow && !(opts.reduceMotion && asset.kind === 'live') && !(opts.lowPower && asset.kind === 'live')
    let streamUrl: string | null = null
    let hiUrl: string | null = null
    if (allowStream) {
      streamUrl = free ? publicUrl(asset.stream_path) : await signedUrl(asset.stream_path)
      if (opts.wifi && asset.hi_path) hiUrl = free ? publicUrl(asset.hi_path) : await signedUrl(asset.hi_path)
    }
    return { ...asset, posterUrl, streamUrl, hiUrl, shouldFetchStream: allowStream }
  }, [unlocked, publicUrl, signedUrl, opts.reduceMotion, opts.lowPower, opts.wifi])

  return { rows, loading, error, reload: load, resolveOne, publicUrl }
}

export async function cachePoster(url: string, id: string) {
  const dir = FileSystem.cacheDirectory + 'posters/'
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {})
  const dest = `${dir}${id}.webp`
  const info = await FileSystem.getInfoAsync(dest)
  if (info.exists) return dest
  const result = await FileSystem.downloadAsync(url, dest)
  return result.uri
}

export function playerSource(resolved: ResolvedAsset) {
  if (resolved.hiUrl) return { uri: resolved.hiUrl }
  if (resolved.streamUrl) return { uri: resolved.streamUrl }
  if (resolved.posterUrl) return { uri: resolved.posterUrl }
  return null
}

export function overlayFor(asset: MediaAsset, unlockedIds: string[]) {
  if (!asset.premium || unlockedIds.includes(asset.id)) return 'none' as const
  return asset.locked_treatment
}

export const platformNote = Platform.OS === 'ios'
  ? 'In-app layer only. iOS has no third-party live home-screen API.'
  : 'In-app layer first. WallpaperService is a later native module.'
