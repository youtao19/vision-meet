/**
 * 文件作用：定义 Pi 运行时的共享类型。
 * 设计边界：这里只放被多个模块（ai/、pi-tools/）共同引用的类型，不放业务专用类型。
 */

/**
 * Pi Agent 思考强度等级。
 */
export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
