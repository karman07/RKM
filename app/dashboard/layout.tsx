import DashboardSidebar from '../../components/DashboardSidebar';
import FloatingNotificationBell from '../../components/FloatingNotificationBell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSidebar>
      {children}
      <FloatingNotificationBell />
    </DashboardSidebar>
  );
}
