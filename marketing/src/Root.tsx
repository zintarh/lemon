import { Composition } from "remotion";
import { LemonVideo } from "./LemonVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LemonMarketing"
      component={LemonVideo}
      durationInFrames={540} // 18 seconds at 30fps
      fps={30}
      width={1080}
      height={1920} // vertical (9:16) for social
    />
  );
};
