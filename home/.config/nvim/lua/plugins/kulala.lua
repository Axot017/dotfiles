return {
  "mistweaverco/kulala.nvim",
  keys = {
    {
      "<leader>hs",
      function() require("kulala").run() end,
      silent = true,
      desc = "Run Kulala",
    },
    {
      "<leader>ha",
      function() require("kulala").run_all() end,
      silent = true,
      desc = "Run all Kulala",
    },
    {
      "<leader>hb",
      function() require("kulala").scratch() end,
      silent = true,
      desc = "Kulala scratch",
    },
  },
  opts = {
    global_keymaps = false,
  },
}
