import { Picture } from "../../components/Picture";
import { THESIS } from "../../config/site";

export function AuthArt() {
  return (
    <div className="auth-art" aria-hidden="true">
      <Picture
        landscape={{ name: "desk-window", widths: [960, 1600] }}
        width={1600}
        height={900}
        sizes="50vw"
        alt=""
      />
      <blockquote>{THESIS}</blockquote>
    </div>
  );
}
