// import ChatWidget from "@/components/ChatWidget"; // dormant for now
import PushManager from "@/components/PushManager";
import SiteTour from "@/components/SiteTour";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PushManager />
      <SiteTour />
      {/* Chat kept dormant for now — re-enable by uncommenting. */}
      {/* <ChatWidget /> */}
    </>
  );
}
