import React, { useEffect, useState } from "react";

interface ConfettiPiece {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage -20 to 110
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  speedY: number;
  speedX: number;
  shape: "circle" | "rect" | "triangle";
}

const COLORS = ["#FF6B6B", "#4D96FF", "#6BCB77", "#FFD93D", "#9D4EDD", "#FF5C8D", "#34B3F1", "#FF8E3C"];

export const Confetti: React.FC<{ active: boolean; duration?: number }> = ({
  active,
  duration = 5000,
}) => {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setIsVisible(false);
      setPieces([]);
      return;
    }

    setIsVisible(true);
    // Create initial pieces
    const initialPieces: ConfettiPiece[] = Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -20 - Math.random() * 50,
      size: Math.random() * 10 + 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      speedY: Math.random() * 3 + 2,
      speedX: (Math.random() - 0.5) * 2,
      shape: ["circle", "rect", "triangle"][Math.floor(Math.random() * 3)] as any,
    }));
    setPieces(initialPieces);

    // Animation loop
    let animationFrameId: number;
    const updateAnimation = () => {
      setPieces((prev) =>
        prev.map((piece) => {
          let nextY = piece.y + piece.speedY;
          let nextX = piece.x + piece.speedX;

          // Wrap or reset at bottom
          if (nextY > 110) {
            nextY = -15;
            nextX = Math.random() * 100;
          }

          return {
            ...piece,
            y: nextY,
            x: nextX,
            rotation: (piece.rotation + piece.rotationSpeed) % 360,
          };
        })
      );
      animationFrameId = requestAnimationFrame(updateAnimation);
    };

    animationFrameId = requestAnimationFrame(updateAnimation);

    // Auto terminate after duration
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timer);
    };
  }, [active, duration]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes drift {
          0% { transform: translateX(0px); }
          50% { transform: translateX(10px); }
          100% { transform: translateX(0px); }
        }
      `}</style>
      {pieces.map((piece) => {
        const style: React.CSSProperties = {
          position: "absolute",
          left: `${piece.x}%`,
          top: `${piece.y}%`,
          width: piece.shape === "circle" ? `${piece.size}px` : piece.shape === "rect" ? `${piece.size}px` : undefined,
          height: piece.shape === "circle" ? `${piece.size}px` : piece.shape === "rect" ? `${piece.size * 0.5}px` : undefined,
          backgroundColor: piece.shape !== "triangle" ? piece.color : undefined,
          borderRadius: piece.shape === "circle" ? "50%" : piece.shape === "rect" ? "2px" : undefined,
          transform: `rotate(${piece.rotation}deg)`,
          opacity: 0.9,
          // For triangle custom render
          borderLeft: piece.shape === "triangle" ? `${piece.size / 2}px solid transparent` : undefined,
          borderRight: piece.shape === "triangle" ? `${piece.size / 2}px solid transparent` : undefined,
          borderBottom: piece.shape === "triangle" ? `${piece.size}px solid ${piece.color}` : undefined,
        };

        return <div key={piece.id} style={style} />;
      })}
    </div>
  );
};
