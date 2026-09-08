// import ChatWidget from "@/components/ChatWidget"; // dormant for now
import PushManager from "@/components/PushManager";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PushManager />
      {/* Chat kept dormant for now — re-enable by uncommenting. */}
      {/* <ChatWidget /> */}
    </>
  );
}
