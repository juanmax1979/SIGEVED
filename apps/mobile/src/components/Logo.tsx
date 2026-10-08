import { FINGERPRINT_PATHS } from "../../../../packages/shared/src/index";
import Svg, { Path } from "react-native-svg";
import { theme } from "../theme";

export function Logo({ size = 46 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {FINGERPRINT_PATHS.map((d) => (
        <Path key={d} d={d} stroke={theme.ink} strokeWidth={2.4} strokeLinecap="round" />
      ))}
    </Svg>
  );
}
