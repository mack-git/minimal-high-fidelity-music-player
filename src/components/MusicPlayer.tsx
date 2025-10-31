"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  FolderOpen,
  Music,
  Repeat,
  Shuffle,
  Search,
  RefreshCw,
  Palette,
  ArrowUpDown,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import * as mm from 'music-metadata-browser'

interface Track {
  id: string
  file: File
  title: string
  artist: string
  album: string
  duration: number
  albumArt?: string
  url: string
  addedAt: number
}

type SortOption = 'title' | 'artist' | 'album' | 'duration' | 'dateAdded'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'dateAdded', label: 'Recently Added' },
  { value: 'title', label: 'Title (A-Z)' },
  { value: 'artist', label: 'Artist (A-Z)' },
  { value: 'album', label: 'Album (A-Z)' },
  { value: 'duration', label: 'Duration' },
]

export default function MusicPlayer() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [isMuted, setIsMuted] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [themeColor, setThemeColor] = useState('#6ee7b7') // Default green
  const [loadedFiles, setLoadedFiles] = useState<File[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('dateAdded')
  const [playHistory, setPlayHistory] = useState<number[]>([])
  const [glowColors, setGlowColors] = useState<string[]>([])
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null

  // Apply theme color
  useEffect(() => {
    const rgb = hexToRgb(themeColor)
    if (rgb) {
      const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b)
      const oklchColor = `oklch(${oklch.l} ${oklch.c} ${oklch.h})`
      document.documentElement.style.setProperty('--primary', oklchColor)
      document.documentElement.style.setProperty('--ring', oklchColor)
      document.documentElement.style.setProperty('--sidebar-primary', oklchColor)
      document.documentElement.style.setProperty('--sidebar-ring', oklchColor)
    }
  }, [themeColor])

  // Extract dominant colors from album art for glow effect
  useEffect(() => {
    if (!currentTrack?.albumArt) {
      setGlowColors([])
      return
    }

    const extractColors = async () => {
      try {
        const img = new Image()
        img.crossOrigin = 'Anonymous'
        
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)

          // Sample colors from center regions (not edges)
          const colors = []
          const samplePoints = [
            { x: 0.33, y: 0.33 },
            { x: 0.5, y: 0.5 },
            { x: 0.67, y: 0.67 },
            { x: 0.33, y: 0.67 },
            { x: 0.67, y: 0.33 },
          ]

          for (const point of samplePoints) {
            const x = Math.floor(img.width * point.x)
            const y = Math.floor(img.height * point.y)
            const imageData = ctx.getImageData(x, y, 1, 1).data
            const rgb = { r: imageData[0], g: imageData[1], b: imageData[2] }
            
            // Calculate brightness to filter out very dark colors
            const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
            
            // Calculate saturation to prefer colorful areas
            const max = Math.max(rgb.r, rgb.g, rgb.b)
            const min = Math.min(rgb.r, rgb.g, rgb.b)
            const saturation = max === 0 ? 0 : (max - min) / max
            
            if (brightness > 40 && saturation > 0.2) {
              colors.push({ ...rgb, brightness, saturation })
            }
          }

          // Sort by saturation and brightness for most vibrant colors
          colors.sort((a, b) => (b.saturation + b.brightness / 255) - (a.saturation + a.brightness / 255))
          
          const topColors = colors.slice(0, 2).map(c => `rgb(${c.r}, ${c.g}, ${c.b})`)
          setGlowColors(topColors)
        }

        img.src = currentTrack.albumArt
      } catch (error) {
        console.error('Error extracting colors:', error)
        setGlowColors([])
      }
    }

    extractColors()
  }, [currentTrack?.albumArt])

  // Color conversion helper functions
  function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  function rgbToOklch(r: number, g: number, b: number) {
    // Normalize RGB to 0-1
    r = r / 255
    g = g / 255
    b = b / 255
    
    // Simple approximation for demo purposes
    // In production, you'd want a proper color space conversion library
    const l = 0.7
    const c = 0.19
    const h = Math.atan2(g - b, r - g) * (180 / Math.PI)
    
    return { l, c, h: h < 0 ? h + 360 : h }
  }

  // Parse audio file metadata
  const parseAudioFile = useCallback(async (file: File): Promise<Track> => {
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    
    return new Promise((resolve) => {
      audio.addEventListener('loadedmetadata', async () => {
        const duration = audio.duration
        
        try {
          const metadata = await mm.parseBlob(file)
          const { common } = metadata
          
          let albumArt: string | undefined
          if (common.picture && common.picture.length > 0) {
            const picture = common.picture[0]
            const blob = new Blob([picture.data], { type: picture.format })
            albumArt = URL.createObjectURL(blob)
          }
          
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            file,
            title: common.title || file.name.replace(/\.[^/.]+$/, ''),
            artist: common.artist || 'Unknown Artist',
            album: common.album || 'Unknown Album',
            duration,
            albumArt,
            url,
            addedAt: Date.now(),
          })
        } catch (error) {
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            file,
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration,
            url,
            addedAt: Date.now(),
          })
        }
      })
    })
  }, [])

  // Handle folder upload
  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsScanning(true)
    const files = Array.from(e.target.files || [])
    const audioFiles = files.filter(file => file.type.startsWith('audio/'))
    
    setLoadedFiles(audioFiles)
    
    const parsedTracks = await Promise.all(audioFiles.map(parseAudioFile))
    setTracks(parsedTracks)
    
    if (currentTrackIndex === null && parsedTracks.length > 0) {
      setCurrentTrackIndex(0)
    }
    setIsScanning(false)
  }

  // Rescan folder
  const handleRescan = async () => {
    if (loadedFiles.length === 0) {
      fileInputRef.current?.click()
      return
    }
    
    setIsScanning(true)
    const parsedTracks = await Promise.all(loadedFiles.map(parseAudioFile))
    setTracks(parsedTracks)
    setIsScanning(false)
  }

  // Sort tracks
  const sortTracks = useCallback((tracksToSort: Track[]) => {
    const sorted = [...tracksToSort]
    
    switch (sortBy) {
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case 'artist':
        return sorted.sort((a, b) => a.artist.localeCompare(b.artist))
      case 'album':
        return sorted.sort((a, b) => a.album.localeCompare(b.album))
      case 'duration':
        return sorted.sort((a, b) => a.duration - b.duration)
      case 'dateAdded':
        return sorted.sort((a, b) => b.addedAt - a.addedAt)
      default:
        return sorted
    }
  }, [sortBy])

  // Filter and sort tracks
  const filteredTracks = sortTracks(
    tracks.filter(track => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query)
      )
    })
  )

  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || currentTrack === null) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying, currentTrack])

  const playNext = useCallback(() => {
    if (tracks.length === 0) return
    
    let nextIndex: number
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * tracks.length)
    } else {
      nextIndex = currentTrackIndex !== null 
        ? (currentTrackIndex + 1) % tracks.length 
        : 0
    }
    
    // Add current track to history
    if (currentTrackIndex !== null) {
      setPlayHistory(prev => [...prev, currentTrackIndex])
    }
    
    setCurrentTrackIndex(nextIndex)
    setIsPlaying(true)
  }, [tracks.length, currentTrackIndex, isShuffle])

  const playPrevious = useCallback(() => {
    if (tracks.length === 0) return
    
    // If more than 3 seconds into the song, restart it
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0
    } else {
      // Go back in history if available
      if (playHistory.length > 0) {
        const prevIndex = playHistory[playHistory.length - 1]
        setPlayHistory(prev => prev.slice(0, -1))
        setCurrentTrackIndex(prevIndex)
      } else {
        // Otherwise, just go to previous track in list
        const prevIndex = currentTrackIndex !== null 
          ? (currentTrackIndex - 1 + tracks.length) % tracks.length 
          : 0
        setCurrentTrackIndex(prevIndex)
      }
      setIsPlaying(true)
    }
  }, [tracks.length, currentTrackIndex, currentTime, playHistory])

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0]
      setCurrentTime(value[0])
    }
  }

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0]
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false)
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
    }
    setIsMuted(!isMuted)
  }

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0
        audio.play()
      } else {
        playNext()
      }
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [isRepeat, playNext])

  // Auto-play when track changes
  useEffect(() => {
    if (audioRef.current && currentTrack && isPlaying) {
      audioRef.current.play()
    }
  }, [currentTrack, isPlaying])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlayPause()
          break
        case 'ArrowRight':
          if (e.shiftKey) {
            playNext()
          } else if (audioRef.current) {
            audioRef.current.currentTime = Math.min(duration, currentTime + 5)
          }
          break
        case 'ArrowLeft':
          if (e.shiftKey) {
            playPrevious()
          } else if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, currentTime - 5)
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(prev => Math.min(1, prev + 0.1))
          if (audioRef.current) audioRef.current.volume = Math.min(1, volume + 0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(prev => Math.max(0, prev - 0.1))
          if (audioRef.current) audioRef.current.volume = Math.max(0, volume - 0.1)
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [togglePlayPause, playNext, playPrevious, currentTime, duration, volume])

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar - Track List */}
      <div className="w-80 bg-card border-r border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Music Library</h2>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <ArrowUpDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                    >
                      {option.label}
                      {sortBy === option.value && ' ✓'}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="relative">
                <Button size="icon" variant="ghost" className="relative overflow-hidden">
                  <Palette className="w-4 h-4 relative z-10" />
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 mb-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
              variant="outline"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Load Folder
            </Button>
            <Button
              onClick={handleRescan}
              variant="outline"
              size="icon"
              disabled={isScanning}
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is not in the types but works in browsers
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
            onChange={handleFolderUpload}
          />
        </div>

        <div className="px-4 py-2 text-xs text-muted-foreground">
          {filteredTracks.length} {filteredTracks.length === 1 ? 'track' : 'tracks'}
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2">
              {filteredTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Music className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">
                    {searchQuery ? 'No tracks found' : 'No tracks loaded'}
                  </p>
                </div>
              ) : (
                filteredTracks.map((track, index) => {
                  const actualIndex = tracks.indexOf(track)
                  return (
                    <button
                      key={track.id}
                      onClick={() => {
                        // Add current track to history before switching
                        if (currentTrackIndex !== null && currentTrackIndex !== actualIndex) {
                          setPlayHistory(prev => [...prev, currentTrackIndex])
                        }
                        setCurrentTrackIndex(actualIndex)
                        setIsPlaying(true)
                      }}
                      className={`w-full p-3 rounded-lg text-left transition-colors hover:bg-accent ${
                        currentTrackIndex === actualIndex ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="font-medium text-sm truncate">{track.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {track.artist}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatTime(track.duration)}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Album Art & Track Info */}
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center max-w-xl">
            <div className="mb-8 relative">
              {currentTrack?.albumArt ? (
                <div className="relative inline-block">
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.album}
                    className="w-80 h-80 rounded-lg shadow-2xl mx-auto object-cover relative z-10"
                    style={{
                      boxShadow: glowColors.length > 0
                        ? `0 0 60px ${glowColors[0]}33, 0 0 100px ${glowColors[1] || glowColors[0]}26, 0 8px 32px rgba(0,0,0,0.3)`
                        : undefined,
                      transition: 'box-shadow 0.6s ease-in-out',
                    }}
                  />
                </div>
              ) : (
                <div className="w-80 h-80 rounded-lg bg-muted flex items-center justify-center mx-auto shadow-2xl">
                  <Music className="w-32 h-32 text-muted-foreground opacity-20" />
                </div>
              )}
            </div>
            
            {currentTrack && (
              <>
                <h1 className="text-4xl font-bold mb-2">{currentTrack.title}</h1>
                <p className="text-xl text-muted-foreground mb-1">{currentTrack.artist}</p>
                <p className="text-sm text-muted-foreground">{currentTrack.album}</p>
              </>
            )}
          </div>
        </div>

        {/* Player Controls */}
        <div className="border-t border-border bg-card p-6">
          {/* Progress Bar */}
          <div className="mb-4">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="mb-2 cursor-pointer [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_.slate-track]:h-2"
              disabled={!currentTrack}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isShuffle ? "default" : "ghost"}
                onClick={() => setIsShuffle(!isShuffle)}
              >
                <Shuffle className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={isRepeat ? "default" : "ghost"}
                onClick={() => setIsRepeat(!isRepeat)}
              >
                <Repeat className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <Button
                size="icon"
                variant="ghost"
                onClick={playPrevious}
                disabled={!currentTrack}
              >
                <SkipBack className="w-5 h-5" />
              </Button>
              
              <Button
                size="icon"
                className="w-12 h-12"
                onClick={togglePlayPause}
                disabled={!currentTrack}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </Button>
              
              <Button
                size="icon"
                variant="ghost"
                onClick={playNext}
                disabled={!currentTrack}
              >
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex items-center gap-2 w-40">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audio Element */}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onError={(e) => console.error('Audio error:', e)}
      />
    </div>
  )
}