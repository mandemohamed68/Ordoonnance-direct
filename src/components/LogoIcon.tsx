import React from 'react';

interface LogoIconProps {
  size?: number;
  className?: string;
  logoUrl?: string;
}

export const LogoIcon: React.FC<LogoIconProps> = ({ size = 48, className = "", logoUrl }) => {
  const finalLogo = logoUrl || "/logoOD.png";
  return (
    <div style={{ width: size, height: size }} className={`flex items-center justify-center shrink-0 ${className}`}>
      <img 
        src={finalLogo} 
        alt="Ordonnance Direct Logo" 
        className="w-full h-full object-contain"
        onError={(e) => {
          e.currentTarget.src = "/logoOD.png";
        }}
      />
    </div>
  );
};

export default LogoIcon;

