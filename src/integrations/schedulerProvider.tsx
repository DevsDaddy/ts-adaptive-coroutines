/**
 * TypeScript Coroutines React Integration
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {Scheduler} from "../core/scheduler";
import {createContext} from "react";

/* Scheduler Context */
export const SchedulerContext = createContext<Scheduler | null>(null);

export function SchedulerProvider({ scheduler, children } : {
    scheduler: Scheduler;
    children: React.ReactNode;
}) {
    return (<SchedulerContext.Provider value={scheduler}>{children}</SchedulerContext.Provider>);
}