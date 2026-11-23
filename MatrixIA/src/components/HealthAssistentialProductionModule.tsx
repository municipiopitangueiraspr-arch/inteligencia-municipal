import HealthVisitsAttendanceModule, {
  type HealthVisitsAttendanceModuleProps,
} from "./HealthVisitsAttendanceModule";

export default function HealthAssistentialProductionModule(
  props: Omit<HealthVisitsAttendanceModuleProps, "focus">,
) {
  return <HealthVisitsAttendanceModule {...props} focus="attendance" />;
}
