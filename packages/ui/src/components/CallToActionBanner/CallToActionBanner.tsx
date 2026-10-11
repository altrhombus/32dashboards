import "./CallToActionBanner.css";

export interface CallToActionBannerProps {
  text: string;
}

export function CallToActionBanner({ text }: CallToActionBannerProps) {
  if (!text) return null;
  return (
    <div className="call-to-action-banner clamp-1" title={text}>
      {text}
    </div>
  );
}
