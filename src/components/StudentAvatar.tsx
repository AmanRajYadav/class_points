import React from "react";

export interface AvatarPreset {
  id: number;
  name: string;
  bgColor: string;
  skinColor: string;
  hairColor: string;
  hairType:
    | "spiky"
    | "curly"
    | "bob"
    | "pony"
    | "cap"
    | "beanie"
    | "afro"
    | "undercut"
    | "wavy"
    | "dreads"
    | "shaved"
    | "bald";
  faceType: "smile" | "laugh" | "wink" | "star" | "cool" | "cute";
  accessory: "glasses" | "sunglasses" | "star-sticker" | "none";
  shirtColor: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 0,
    name: "Cool Blue",
    bgColor: "#4D96FF", // Bright blue
    skinColor: "#FCE1D4", // Light skin
    hairColor: "#4A3728", // Brown hair
    hairType: "spiky",
    faceType: "cool",
    accessory: "sunglasses",
    shirtColor: "#FF6B6B",
  },
  {
    id: 1,
    name: "Teal Geek",
    bgColor: "#00C897", // Emerald teal
    skinColor: "#ECC5B2", // Medium skin
    hairColor: "#1A1A1A", // Black hair
    hairType: "undercut",
    faceType: "smile",
    accessory: "glasses",
    shirtColor: "#FFD93D",
  },
  {
    id: 2,
    name: "Purple Bun",
    bgColor: "#9D4EDD", // Rich purple
    skinColor: "#FCE1D4",
    hairColor: "#D8B4F8", // Lavender hair
    hairType: "pony",
    faceType: "star",
    accessory: "star-sticker",
    shirtColor: "#6BCB77",
  },
  {
    id: 3,
    name: "Sunny Cap",
    bgColor: "#FFD93D", // Golden yellow
    skinColor: "#D2A18C", // Tan skin
    hairColor: "#3D2314",
    hairType: "cap",
    faceType: "wink",
    accessory: "none",
    shirtColor: "#34B3F1",
  },
  {
    id: 4,
    name: "Coral Bob",
    bgColor: "#FF6B6B", // Soft red
    skinColor: "#ECC5B2",
    hairColor: "#F39C12", // Ginger hair
    hairType: "bob",
    faceType: "laugh",
    accessory: "none",
    shirtColor: "#4D96FF",
  },
  {
    id: 5,
    name: "Beanie Champ",
    bgColor: "#FF8E3C", // Orange
    skinColor: "#ECC5B2",
    hairColor: "#2C3E50",
    hairType: "beanie",
    faceType: "cool",
    accessory: "sunglasses",
    shirtColor: "#9B59B6",
  },
  {
    id: 6,
    name: "Teal Wave",
    bgColor: "#34B3F1", // Teal
    skinColor: "#FCE1D4",
    hairColor: "#111111",
    hairType: "wavy",
    faceType: "smile",
    accessory: "glasses",
    shirtColor: "#E74C3C",
  },
  {
    id: 7,
    name: "Afro Beats",
    bgColor: "#6BCB77", // Green
    skinColor: "#5C382C", // Dark skin
    hairColor: "#1A1A1A",
    hairType: "afro",
    faceType: "laugh",
    accessory: "none",
    shirtColor: "#F1C40F",
  },
  {
    id: 8,
    name: "Star Girl",
    bgColor: "#FF5C8D", // Pink
    skinColor: "#FCE1D4",
    hairColor: "#FFC0CB", // Pink hair
    hairType: "pony",
    faceType: "star",
    accessory: "star-sticker",
    shirtColor: "#2ECC71",
  },
  {
    id: 9,
    name: "Dread Explorer",
    bgColor: "#577590", // Steel blue
    skinColor: "#A5735E", // Rich brown skin
    hairColor: "#5C382C",
    hairType: "dreads",
    faceType: "smile",
    accessory: "sunglasses",
    shirtColor: "#FF6B6B",
  },
  {
    id: 10,
    name: "Gold Shaved",
    bgColor: "#E76F51", // Clay orange
    skinColor: "#ECC5B2",
    hairColor: "#F4A261", // Gold hair
    hairType: "shaved",
    faceType: "laugh",
    accessory: "none",
    shirtColor: "#264653",
  },
  {
    id: 11,
    name: "Minty Curly",
    bgColor: "#90BE6D", // Sage green
    skinColor: "#FCE1D4",
    hairColor: "#1A1008",
    hairType: "curly",
    faceType: "cute",
    accessory: "glasses",
    shirtColor: "#FF8E3C",
  },
  {
    id: 12,
    name: "Shadow Goth",
    bgColor: "#4A4E69", // Dark purple grey
    skinColor: "#FCE1D4",
    hairColor: "#222222",
    hairType: "bob",
    faceType: "cute",
    accessory: "none",
    shirtColor: "#9B59B6",
  },
  {
    id: 13,
    name: "Sunset Sailor",
    bgColor: "#F4A261", // Warm sandy
    skinColor: "#A5735E",
    hairColor: "#264653",
    hairType: "cap",
    faceType: "wink",
    accessory: "none",
    shirtColor: "#E76F51",
  },
  {
    id: 14,
    name: "Citrus Cool",
    bgColor: "#2A9D8F", // Dark teal
    skinColor: "#FCE1D4",
    hairColor: "#E76F51",
    hairType: "spiky",
    faceType: "cool",
    accessory: "sunglasses",
    shirtColor: "#E9C46A",
  },
  {
    id: 15,
    name: "Wild Lavender",
    bgColor: "#7209B7", // Deep violet
    skinColor: "#ECC5B2",
    hairColor: "#B5179E", // Magenta hair
    hairType: "wavy",
    faceType: "star",
    accessory: "star-sticker",
    shirtColor: "#4CC9F0",
  },
];

interface StudentAvatarProps {
  presetId: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  animate?: boolean;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  presetId,
  size = "md",
  className = "",
}) => {
  const preset = AVATAR_PRESETS[presetId % AVATAR_PRESETS.length] || AVATAR_PRESETS[0];

  // size mapping
  const sizeClasses = {
    sm: "w-10 h-10 text-xs",
    md: "w-16 h-16 text-sm",
    lg: "w-24 h-24 text-base",
    xl: "w-36 h-36 text-xl",
  };

  // Hair path rendering helper
  const renderHair = () => {
    switch (preset.hairType) {
      case "spiky":
        return (
          <path
            d="M30,38 Q32,24 40,22 Q45,16 50,20 Q55,16 60,22 Q68,24 70,38 C75,28 65,12 50,12 C35,12 25,28 30,38 Z"
            fill={preset.hairColor}
          />
        );
      case "curly":
        return (
          <g fill={preset.hairColor}>
            <circle cx="34" cy="35" r="9" />
            <circle cx="43" cy="27" r="9" />
            <circle cx="53" cy="25" r="9" />
            <circle cx="64" cy="28" r="9" />
            <circle cx="68" cy="37" r="8" />
            <circle cx="40" cy="32" r="9" />
            <circle cx="50" cy="30" r="9" />
            <circle cx="60" cy="32" r="9" />
          </g>
        );
      case "bob":
        return (
          <path
            d="M26,45 C24,30 32,20 50,20 C68,20 76,30 74,45 C74,52 70,55 70,50 C70,35 65,28 50,28 C35,28 30,35 30,50 C30,55 26,52 26,45 Z"
            fill={preset.hairColor}
          />
        );
      case "pony":
        return (
          <g>
            {/* Pony tail base in back */}
            <circle cx="70" cy="40" r="12" fill={preset.hairColor} />
            <path
              d="M66,42 Q85,50 82,62 Q74,62 72,48 Z"
              fill={preset.hairColor}
            />
            {/* Front bangs */}
            <path
              d="M32,38 C32,25 40,21 50,22 C60,21 68,25 68,38 C68,32 60,26 50,26 C40,26 32,32 32,38 Z"
              fill={preset.hairColor}
            />
          </g>
        );
      case "cap":
        return (
          <g>
            {/* Cap Dome */}
            <path
              d="M28,38 C28,24 38,18 50,18 C62,18 72,24 72,38 Z"
              fill="#E74C3C"
            />
            {/* Visor / Brim */}
            <path
              d="M22,38 C22,38 35,42 50,42 C65,42 78,38 78,38 C78,38 72,34 50,34 C28,34 22,38 22,38 Z"
              fill="#C0392B"
            />
            {/* Button on top */}
            <circle cx="50" cy="18" r="3" fill="#F1C40F" />
          </g>
        );
      case "beanie":
        return (
          <g>
            {/* Beanie body */}
            <path
              d="M30,38 C30,22 36,18 50,18 C64,18 70,22 70,38 Q70,43 50,43 Q30,43 30,38 Z"
              fill="#7F8C8D"
            />
            {/* Folded rim */}
            <path
              d="M28,38 C28,36 34,38 50,38 C66,38 72,36 72,38 C72,41 66,43 50,43 C34,43 28,41 28,38 Z"
              fill="#95A5A6"
            />
            {/* Pom pom */}
            <circle cx="50" cy="16" r="5" fill="#E74C3C" />
          </g>
        );
      case "afro":
        return (
          <g fill={preset.hairColor}>
            <circle cx="50" cy="30" r="18" />
            <circle cx="36" cy="36" r="16" />
            <circle cx="64" cy="36" r="16" />
            <circle cx="42" cy="24" r="17" />
            <circle cx="58" cy="24" r="17" />
            <circle cx="30" cy="46" r="12" />
            <circle cx="70" cy="46" r="12" />
          </g>
        );
      case "undercut":
        return (
          <g>
            {/* Shaved side shadows */}
            <path
              d="M30,38 C26,44 26,50 30,52 C32,46 32,42 30,38 Z"
              fill="rgba(0,0,0,0.15)"
            />
            <path
              d="M70,38 C74,44 74,50 70,52 C68,46 68,42 70,38 Z"
              fill="rgba(0,0,0,0.15)"
            />
            {/* Top sweep */}
            <path
              d="M28,38 C26,24 38,16 54,18 C64,19 72,26 70,36 C64,30 54,26 44,28 C34,30 30,34 28,38 Z"
              fill={preset.hairColor}
            />
          </g>
        );
      case "wavy":
        return (
          <g fill={preset.hairColor}>
            <path d="M28,45 C25,35 30,22 50,22 C70,22 75,35 72,45 C70,40 64,34 50,34 C36,34 30,40 28,45 Z" />
            <path d="M28,44 Q24,52 28,60 Q32,55 30,46 Z" />
            <path d="M72,44 Q76,52 72,60 Q68,55 70,46 Z" />
          </g>
        );
      case "dreads":
        return (
          <g fill={preset.hairColor}>
            {/* Left dread locks */}
            <rect x="24" y="32" width="6" height="24" rx="3" />
            <rect x="18" y="38" width="6" height="20" rx="3" />
            <rect x="28" y="36" width="6" height="22" rx="3" />
            {/* Right dread locks */}
            <rect x="70" y="32" width="6" height="24" rx="3" />
            <rect x="76" y="38" width="6" height="20" rx="3" />
            <rect x="66" y="36" width="6" height="22" rx="3" />
            {/* Top base */}
            <path d="M26,36 C26,24 36,20 50,20 C64,20 74,24 74,36 Z" />
          </g>
        );
      case "shaved":
        return (
          <path
            d="M32,36 C32,24 40,22 50,22 C60,22 68,24 68,36 C68,35 60,32 50,32 C40,32 32,35 32,36 Z"
            fill={preset.hairColor}
            opacity="0.4"
          />
        );
      case "bald":
      default:
        return null;
    }
  };

  const renderFaceAndMouth = () => {
    // Face expressions and features
    return (
      <g>
        {/* Blush cheeks */}
        <circle cx="38" cy="56" r="3" fill="#FF8A8A" opacity="0.4" />
        <circle cx="62" cy="56" r="3" fill="#FF8A8A" opacity="0.4" />

        {/* Eyes */}
        {renderEyes()}

        {/* Mouth */}
        {renderMouth()}
      </g>
    );
  };

  const renderEyes = () => {
    switch (preset.faceType) {
      case "laugh":
        return (
          <g stroke="#2C3E50" strokeWidth="2.5" strokeLinecap="round" fill="none">
            {/* Left closed eye */}
            <path d="M34,48 Q39,44 43,48" />
            {/* Right closed eye */}
            <path d="M57,48 Q61,44 66,48" />
          </g>
        );
      case "wink":
        return (
          <g>
            {/* Left winking line */}
            <path
              d="M34,48 Q39,44 43,48"
              stroke="#2C3E50"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Right open eye */}
            <circle cx="61" cy="48" r="3.5" fill="#2C3E50" />
          </g>
        );
      case "star":
        return (
          <g fill="#F1C40F">
            {/* Left star eye */}
            <path d="M38,42 L40,46 L45,46 L41,49 L43,53 L38,50 L34,53 L36,49 L32,46 L37,46 Z" />
            {/* Right star eye */}
            <path d="M62,42 L64,46 L69,46 L65,49 L67,53 L62,50 L58,53 L60,49 L56,46 L61,46 Z" />
          </g>
        );
      case "cool":
        // Usually covered by sunglasses accessory, fallback to open eyes
        return (
          <g fill="#2C3E50">
            <circle cx="38.5" cy="48" r="3" />
            <circle cx="61.5" cy="48" r="3" />
          </g>
        );
      case "cute":
        return (
          <g fill="#2C3E50">
            {/* Big cute anime eyes */}
            <circle cx="38" cy="48" r="4" />
            <circle cx="62" cy="48" r="4" />
            {/* Highlights */}
            <circle cx="36.5" cy="46.5" r="1.5" fill="#FFFFFF" />
            <circle cx="60.5" cy="46.5" r="1.5" fill="#FFFFFF" />
          </g>
        );
      case "smile":
      default:
        return (
          <g fill="#2C3E50">
            <circle cx="38.5" cy="48" r="3" />
            <circle cx="61.5" cy="48" r="3" />
          </g>
        );
    }
  };

  const renderMouth = () => {
    switch (preset.faceType) {
      case "laugh":
        return (
          <g>
            {/* Open laughing mouth */}
            <path
              d="M42,58 Q50,68 58,58 Z"
              fill="#E74C3C"
            />
            <path
              d="M45,61 Q50,64 55,61 Q50,68 45,61"
              fill="#FF8A8A"
            />
            <path
              d="M42,58 Q50,58 58,58"
              stroke="#2C3E50"
              strokeWidth="2"
              fill="none"
            />
          </g>
        );
      case "cute":
        return (
          <path
            d="M46,59 Q50,62 54,59"
            stroke="#2C3E50"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        );
      case "wink":
        return (
          <path
            d="M44,57 Q50,65 56,57"
            stroke="#2C3E50"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        );
      case "smile":
      case "star":
      case "cool":
      default:
        return (
          <path
            d="M43,58 Q50,64 57,58"
            stroke="#2C3E50"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        );
    }
  };

  const renderAccessories = () => {
    switch (preset.accessory) {
      case "glasses":
        return (
          <g stroke="#1A1A1A" strokeWidth="2.5" fill="none">
            {/* Left Lens */}
            <circle cx="38" cy="48" r="8" />
            {/* Right Lens */}
            <circle cx="62" cy="48" r="8" />
            {/* Bridge */}
            <path d="M46,48 L54,48" />
            {/* Temples */}
            <path d="M30,48 L25,46" />
            <path d="M70,48 L75,46" />
          </g>
        );
      case "sunglasses":
        return (
          <g>
            {/* Left dark lens */}
            <path
              d="M28,45 C28,40 45,40 45,45 C45,51 30,51 28,45 Z"
              fill="#2C3E50"
              stroke="#1A1A1A"
              strokeWidth="1"
            />
            {/* Right dark lens */}
            <path
              d="M55,45 C55,40 72,40 72,45 C72,51 57,51 55,45 Z"
              fill="#2C3E50"
              stroke="#1A1A1A"
              strokeWidth="1"
            />
            {/* Connection Bridge */}
            <rect x="45" y="43" width="10" height="2.5" fill="#1A1A1A" />
            {/* Reflections */}
            <polygon points="32,43 36,43 34,48 30,48" fill="#FFFFFF" opacity="0.3" />
            <polygon points="59,43 63,43 61,48 57,48" fill="#FFFFFF" opacity="0.3" />
          </g>
        );
      case "star-sticker":
        return (
          <path
            d="M68,54 L70,56 L73,56 L71,58 L72,61 L68,59 L64,61 L65,58 L63,56 L66,56 Z"
            fill="#F1C40F"
          />
        );
      case "none":
      default:
        return null;
    }
  };

  return (
    <div className={`relative inline-block overflow-hidden rounded-full border-4 border-white shadow-md ${sizeClasses[size]} ${className}`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full select-none"
        xmlns="http://www.w3.org/2000/svg"
        referrerPolicy="no-referrer"
      >
        {/* Background Circle */}
        <circle cx="50" cy="50" r="48" fill={preset.bgColor} />

        {/* Neck */}
        <path d="M43,72 L57,72 L56,60 L44,60 Z" fill={preset.skinColor} />
        {/* Neck Shadow */}
        <path d="M44,60 C44,60 50,65 56,60 L56,64 C56,64 50,68 44,64 Z" fill="rgba(0,0,0,0.1)" />

        {/* Shoulders / Shirt */}
        <path
          d="M20,95 C20,80 32,70 50,70 C68,70 80,80 80,95 Z"
          fill={preset.shirtColor}
        />
        {/* Shirt Collar / Neckline */}
        <path
          d="M40,70 C40,70 50,78 60,70"
          stroke={preset.skinColor}
          strokeWidth="3.5"
          fill="none"
        />

        {/* Head / Face */}
        <circle cx="50" cy="48" r="22" fill={preset.skinColor} />

        {/* Face features, eyes, mouth */}
        {renderFaceAndMouth()}

        {/* Hair */}
        {renderHair()}

        {/* Accessories */}
        {renderAccessories()}
      </svg>
    </div>
  );
};
