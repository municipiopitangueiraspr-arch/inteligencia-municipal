import HealthVisitsAttendanceModule, {
  type HealthVisitsAttendanceModuleProps,
} from "./HealthVisitsAttendanceModule";

export default function HealthVisitsModule(
  props: Omit<HealthVisitsAttendanceModuleProps, "focus">,
) {
  return <HealthVisitsAttendanceModule {...props} focus="visits" />;
}
