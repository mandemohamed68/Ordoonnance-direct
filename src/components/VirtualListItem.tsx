import React, { useState, useEffect, useRef } from 'react';

interface VirtualListItemProps {
  children: React.ReactNode;
  estimatedHeight?: number;
}

export const VirtualListItem: React.FC<VirtualListItemProps> = ({ 
  children, 
  estimatedHeight = 160 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // We use a generous rootMargin of 500px so elements render immediately prior to viewport entrance
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { 
        rootMargin: '500px 0px 500px 0px',
        threshold: 0.01 
      }
    );
    
    const currentRef = domRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  return (
    <div 
      ref={domRef} 
      className="gpu-accelerated"
      style={{ 
        contentVisibility: 'auto',
        containIntrinsicSize: `auto ${estimatedHeight}px`,
        minHeight: isVisible ? undefined : `${estimatedHeight}px`
      }}
    >
      {isVisible ? children : <div style={{ height: `${estimatedHeight}px` }} className="opacity-0" />}
    </div>
  );
};

export default VirtualListItem;
