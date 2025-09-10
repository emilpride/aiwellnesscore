// Утилита для централизованного логирования с correlation ID

class Logger {
  constructor(functionName, sessionId = null) {
    this.functionName = functionName;
    this.sessionId = sessionId;
    this.correlationId = this.generateCorrelationId();
  }

  generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const baseLog = {
      timestamp,
      level,
      function: this.functionName,
      sessionId: this.sessionId,
      correlationId: this.correlationId,
      message
    };
    
    if (data) {
      baseLog.data = data;
    }
    
    return JSON.stringify(baseLog);
  }

  info(message, data = null) {
    console.log(this.formatMessage('INFO', message, data));
  }

  warn(message, data = null) {
    console.warn(this.formatMessage('WARN', message, data));
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      ...error
    } : null;
    console.error(this.formatMessage('ERROR', message, errorData));
  }

  metric(metricName, value, unit = null) {
    const metricData = { value };
    if (unit) metricData.unit = unit;
    console.log(this.formatMessage('METRIC', metricName, metricData));
  }
}

module.exports = Logger;
