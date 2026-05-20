export class ConnectionTrackerService {
  private activeConnections = 0;

  getActiveConnections(): number {
    return this.activeConnections;
  }

  increment(): void {
    this.activeConnections += 1;
  }

  decrement(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }
}
