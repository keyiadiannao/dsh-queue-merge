window.__ModuleLoader__.load({
	id: "dsh-queue-merge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:D:\cursor_try\VLLM\plugins\dsh-queue-merge\src\client\QueuePolicyBar.module.css.mjs
		const css = "._1p1J7G_bar{background:var(--dsw-alias-bg-mask-3,#0e121c99);border:1px solid var(--dsw-alias-border-l2,#8080802e);color:var(--dsw-alias-label-secondary,#aab2c0);font-family:var(--dsw-font-family,ui-sans-serif, system-ui, sans-serif);user-select:none;border-radius:10px;align-items:center;gap:10px;padding:7px 12px;font-size:12px;line-height:1.5;display:flex}._1p1J7G_dot{background:var(--dsw-alias-state-business-primary,#4f7cff);width:6px;height:6px;box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-business-primary,#4f7cff) 45%, transparent);border-radius:50%;flex-shrink:0;animation:1.8s ease-out infinite _1p1J7G_pulse}@keyframes _1p1J7G_pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-business-primary,#4f7cff) 45%, transparent)}70%{box-shadow:0 0 0 5px #0000}to{box-shadow:0 0 #0000}}._1p1J7G_hint{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}._1p1J7G_segmented{background:var(--dsw-alias-bg-layer-1,#161a24cc);border:1px solid var(--dsw-alias-border-l3,#80808038);border-radius:8px;flex-shrink:0;gap:2px;padding:2px;display:inline-flex}._1p1J7G_option{color:var(--dsw-alias-label-secondary,#aab2c0);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 12px;font-size:12px;line-height:1.4;transition:background .12s,color .12s,box-shadow .12s}._1p1J7G_option:hover{color:var(--dsw-alias-label-primary,#f2f6fc)}._1p1J7G_active{background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4f7cff) 22%, transparent);color:var(--dsw-alias-label-primary,#f2f6fc);box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary,#4f7cff) 45%, transparent) inset;font-weight:500}@media (prefers-reduced-motion:reduce){._1p1J7G_dot{animation:none}._1p1J7G_option{transition:none}}";
		const tagId = "dsh-queue-merge/QueuePolicyBar.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-queue-merge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var QueuePolicyBar_module_css_default = {
			"dot": "_1p1J7G_dot",
			"active": "_1p1J7G_active",
			"pulse": "_1p1J7G_pulse",
			"option": "_1p1J7G_option",
			"hint": "_1p1J7G_hint",
			"segmented": "_1p1J7G_segmented",
			"bar": "_1p1J7G_bar"
		};
		//#endregion
		//#region src/client/QueuePolicyBar.tsx
		/**
		* Queue policy bar — rendered in the input dock (`conversation.input.dock`,
		* above the composer card, right under the native queue dock) while the agent
		* is busy and messages are queued. Lets the user choose how the queued batch
		* will be consumed when the current task ends:
		*   merge        → intent synthesis, one combined execution (this plugin)
		*   individually → official one-message-per-turn behavior
		* The choice AND the active UI locale are POSTed to the host per-session; the
		* host's agent/pre-step hook uses the locale for the consolidation language.
		*/
		/** Policy endpoint on the host. */
		const POLICY = "/api/dsh-queue-merge/policy";
		/** Only render while the agent is busy AND at least one message is queued —
		* zero footprint when idle. */
		function QueuePolicyBar(props) {
			const { t, session } = props;
			const [mode, setModeState] = (0, react.useState)("merge");
			const sessionId = props.sessionId ?? session.id ?? "";
			const locale = props.locale ?? "zh";
			const queued = session.queue.filter((q) => q.placement === "queued");
			(0, react.useEffect)(() => {
				if (sessionId === "" || !session.running || queued.length === 0) return;
				fetch(POLICY, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sessionId,
						locale
					})
				}).catch(() => {});
			}, [
				sessionId,
				locale,
				session.running,
				queued.length
			]);
			if (!session.running || queued.length === 0) return null;
			const setMode = (next) => {
				setModeState(next);
				if (sessionId === "") return;
				fetch(POLICY, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sessionId,
						mode: next,
						locale
					})
				}).catch(() => {});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: QueuePolicyBar_module_css_default.bar,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: QueuePolicyBar_module_css_default.dot,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: QueuePolicyBar_module_css_default.hint,
						title: mode === "merge" ? t("mergeHint") : t("individuallyHint"),
						children: mode === "merge" ? t("willMerge") : t("willIndividually")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: QueuePolicyBar_module_css_default.segmented,
						role: "group",
						"aria-label": t("policyTitle"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: mode === "merge" ? `${QueuePolicyBar_module_css_default.option} ${QueuePolicyBar_module_css_default.active}` : QueuePolicyBar_module_css_default.option,
							title: t("mergeHint"),
							"aria-pressed": mode === "merge",
							onClick: () => setMode("merge"),
							children: t("merge")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: mode === "individually" ? `${QueuePolicyBar_module_css_default.option} ${QueuePolicyBar_module_css_default.active}` : QueuePolicyBar_module_css_default.option,
							title: t("individuallyHint"),
							"aria-pressed": mode === "individually",
							onClick: () => setMode("individually"),
							children: t("individually")
						})]
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
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "dsh-queue-merge-policy",
				order: 30,
				locale: NS,
				inject: () => ({ locale: ctx.locale.getLocale?.()?.active ?? "zh" })
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