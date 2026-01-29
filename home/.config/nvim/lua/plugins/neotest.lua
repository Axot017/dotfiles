return {
  "nvim-neotest/neotest",
  dependencies = {
    "nvim-neotest/nvim-nio",
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
    "nvim-neotest/neotest-golang",
    "nvim-neotest/neotest-elixir",
  },
  opts = function()
    return {
      adapters = {
        require("neotest-golang"),
        require("neotest-elixir"),
      },
    }
  end,
}
