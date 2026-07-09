import { mount } from "cypress/vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "@/assets/tailwind.css";

Cypress.Commands.add("mount", (component, options = {}) => {
  const global = options.global ?? {};
  const plugins = global.plugins ?? [];

  return mount(component, {
    ...options,
    global: {
      ...global,
      plugins: [...plugins, ElementPlus],
      stubs: {
        ...global.stubs,
        transition: false,
      },
    },
  });
});
