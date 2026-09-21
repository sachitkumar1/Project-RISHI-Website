// import ChatWidget from "@/components/ChatWidget"; // dormant for now
import PushManager from "@/components/PushManager";
import { DashboardTheme } from "@/components/ThemeToggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PushManager />
      <DashboardTheme />
      {/* Chat kept dormant for now — re-enable by uncommenting. */}
      {/* <ChatWidget /> */}
    </>
  );
}
