window.__ModuleLoader__.load({
	id: "dsh-queue-merge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/QueuePolicyBar.tsx
		/**
		* Queue policy bar — rendered in the composer dock (`conversation.composer.dock`)
		* while the agent is busy and messages are queued. Lets the user choose how
		* the queued batch will be consumed when the current task ends:
		*   merge        → intent synthesis, one combined execution (this plugin)
		*   individually → official one-message-per-turn behavior
		* The choice is POSTed to the host per-session; the host's agent/pre-step hook
		* reads it at the turn boundary.
		*/
		/** Policy endpoint on the host. */
		const POLICY = "/api/dsh-queue-merge/policy";
		/** Only render while the agent is busy AND at least one message is queued —
		* zero footprint when idle. */
		function QueuePolicyBar(props) {
			const { t, session } = props;
			const [mode, setModeState] = (0, react.useState)("merge");
			const queued = session.queue.filter((q) => q.placement === "queued");
			if (!session.running || queued.length === 0) return null;
			const sessionId = props.sessionId ?? session.id ?? "";
			const setMode = (next) => {
				setModeState(next);
				if (sessionId === "") return;
				fetch(POLICY, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sessionId,
						mode: next
					})
				}).catch(() => {});
			};
			const modeBtnStyle = (active) => ({
				padding: "3px 10px",
				borderRadius: 6,
				border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.3))",
				background: active ? "var(--dsw-alias-button-primary-dimmed, rgba(65,118,230,0.2))" : "transparent",
				color: active ? "var(--dsw-alias-label-primary, #f2f6fc)" : "var(--dsw-alias-label-secondary, #aab2c0)",
				font: "inherit",
				fontSize: 12,
				cursor: "pointer"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 10,
					padding: "6px 12px",
					borderRadius: 8,
					background: "var(--dsw-alias-bg-layer-2, rgba(24,28,38,0.6))",
					border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
					color: "var(--dsw-alias-label-secondary, #aab2c0)",
					fontFamily: "var(--dsw-font-family, ui-sans-serif, system-ui, sans-serif)",
					fontSize: 12,
					lineHeight: 1.5
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: { flexShrink: 0 },
						children: t("queueCount").replace("{n}", String(queued.length))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: 1,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: mode === "merge" ? t("willMerge") : t("willIndividually")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						title: t("mergeHint"),
						onClick: () => setMode("merge"),
						style: modeBtnStyle(mode === "merge"),
						children: t("merge")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						title: t("individuallyHint"),
						onClick: () => setMode("individually"),
						style: modeBtnStyle(mode === "individually"),
						children: t("individually")
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Locale dictionaries for dsh-queue-merge (zh / en).
		* Registered under the `queue.merge` namespace.
		*/
		const zh = {
			policyTitle: "后续消息处理",
			merge: "合并处理",
			mergeHint: "当前任务完成后，先综合全部消息再统一执行",
			individually: "逐条处理",
			individuallyHint: "按发送顺序分别交给模型",
			queueCount: "{n} 条排队消息",
			willMerge: "当前任务结束后将合并处理这批消息",
			willIndividually: "当前任务结束后将逐条处理这批消息"
		};
		const en = {
			policyTitle: "Queued messages",
			merge: "Merge",
			mergeHint: "Synthesize all queued messages, then execute as one batch",
			individually: "Individually",
			individuallyHint: "Process each queued message as its own turn",
			queueCount: "{n} queued messages",
			willMerge: "Will merge this batch after the current task ends",
			willIndividually: "Will process this batch one message per turn"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required services. */
		const inject = ["slots", "locale"];
		/** Locale namespace for this plugin's UI strings. */
		const NS = "queue.merge";
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-queue-merge: dictionaries");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "dsh-queue-merge-policy",
				locale: NS
			}, QueuePolicyBar));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map