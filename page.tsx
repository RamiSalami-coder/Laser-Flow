'use client'

import dynamic from 'next/dynamic'

// Load the game only on the client (uses canvas, audio, window).
const LaserFlow = dynamic(() => import('@/components/game/LaserFlow'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[#050510]">
      <div className="font-display text-sm font-bold tracking-[0.4em] text-cyan-300/70 neon-text-soft">
        LASER FLOW
      </div>
    </div>
  ),
})

export default function Home() {
  return <LaserFlow />
}
