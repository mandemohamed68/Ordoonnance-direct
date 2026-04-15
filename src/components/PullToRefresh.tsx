import React, { useState, useRef } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const controls = useAnimationControls();

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].pageY;
      setPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;

    const currentY = e.touches[0].pageY;
    const distance = Math.max(0, (currentY - startY.current) * 0.4); // Resistance factor

    if (distance > 0) {
      setPullDistance(distance);
      controls.set({ y: distance });
    }
  };

  const handleTouchEnd = async () => {
    if (!pulling || refreshing) return;

    if (pullDistance > 80) {
      setRefreshing(true);
      setPullDistance(80);
      await controls.start({ y: 80 });
      
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPulling(false);
        setPullDistance(0);
        controls.start({ y: 0 });
      }
    } else {
      setPulling(false);
      setPullDistance(0);
      controls.start({ y: 0 });
    }
  };

  return (
    <div 
      className="relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center pointer-events-none z-50"
        style={{ height: 80, transform: `translateY(${pullDistance - 80}px)` }}
      >
        <motion.div
          animate={{ rotate: refreshing ? 360 : 0 }}
          transition={{ repeat: refreshing ? Infinity : 0, duration: 1, ease: "linear" }}
          className={`p-2 rounded-full bg-white shadow-lg border border-slate-100 text-primary ${pullDistance > 60 ? 'opacity-100' : 'opacity-40'}`}
        >
          <RefreshCw size={24} />
        </motion.div>
      </div>
      <motion.div animate={controls}>
        {children}
      </motion.div>
    </div>
  );
};
