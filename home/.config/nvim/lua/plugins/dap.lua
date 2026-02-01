return {
  "mfussenegger/nvim-dap",
  dependencies = {
    {
      "rcarriga/nvim-dap-ui",
      main = "dapui",
      opts = {},
    },
    {
      "leoluz/nvim-dap-go",
      main = "dap-go",
      opts = {},
    },
    "nvim-neotest/nvim-nio",
  },
  keys = {
    {
      "<leader>dh",
      function() require("dapui").eval() end,
      silent = true,
      desc = "DAP eval hover",
    },
    {
      "<leader>de",
      function()
        vim.ui.input({ prompt = "Expression: " }, function(input)
          if input then
            require("dapui").eval(input)
          end
        end)
      end,
      silent = true,
      desc = "DAP eval expression",
    },
    {
      "<leader>dt",
      function() require("dapui").toggle() end,
      silent = true,
      desc = "DAP UI toggle",
    },
    {
      "<leader>dc",
      function() require("dap").continue() end,
      silent = true,
      desc = "DAP continue",
    },
    {
      "<leader>di",
      function() require("dap").step_into() end,
      silent = true,
      desc = "DAP step into",
    },
    {
      "<leader>do",
      function() require("dap").step_over() end,
      silent = true,
      desc = "DAP step over",
    },
    {
      "<leader>db",
      function() require("dap").toggle_breakpoint() end,
      silent = true,
      desc = "DAP toggle breakpoint",
    },
    {
      "<F1>",
      function() require("dapui").toggle() end,
      silent = true,
      desc = "DAP UI toggle",
    },
    {
      "<F2>",
      function() require("dap").continue() end,
      silent = true,
      desc = "DAP continue",
    },
    {
      "<F3>",
      function() require("dap").toggle_breakpoint() end,
      silent = true,
      desc = "DAP toggle breakpoint",
    },
  },
  config = function()
    local dap, dapui = require("dap"), require("dapui")
    dap.listeners.after.event_initialized["dapui_config"] = function()
      dapui.open()
    end
    dap.listeners.before.event_terminated["dapui_config"] = function()
      dapui.close()
    end
    dap.listeners.before.event_exited["dapui_config"] = function()
      dapui.close()
    end
  end,
}
