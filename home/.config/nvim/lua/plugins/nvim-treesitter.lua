return {
  "nvim-treesitter/nvim-treesitter",
  dependencies = {
    "nvim-treesitter/nvim-treesitter-textobjects",
  },
  lazy = false,
  build = ":TSUpdate",
  opts = {
    highlight = {
      enable = true,
      additional_vim_regex_highlighting = false,
    },
    indent = {
      enable = true,
    },
    incremental_selection = {
      enable = true,
      keymaps = {
        init_selection = "gnn",
        node_incremental = "grn",
        scope_incremental = "grc",
        node_decremental = "grm",
      },
    },
    textobjects = {
      move = {
        enable = true,
        set_jumps = true,
        goto_next_start = {
          ["]f"] = { query = "@function.outer", desc = "Go to next function" },
        },
        goto_next_end = {
          ["]F"] = { query = "@function.outer", desc = "Go to next function end" },
        },
        goto_previous_start = {
          ["[f"] = { query = "@function.outer", desc = "Go to previous function" },
        },
        goto_previous_end = {
          ["[F"] = { query = "@function.outer", desc = "Go to previous function end" },
        },
      },
      select = {
        enable = true,
        lookahead = true,
        keymaps = {
          ["af"] = { query = "@function.outer", desc = "Select a function" },
          ["if"] = { query = "@function.inner", desc = "Select a function body" },
          ["ac"] = { query = "@class.outer", desc = "Select a class" },
          ["ic"] = { query = "@class.inner", desc = "Select a class body" },
        },
        selection_modes = {
          ["@parameter.outer"] = "v",
          ["@function.outer"] = "V",
          ["@class.outer"] = "<c-v>",
        },
        include_surrounding_whitespace = true,
      },
    },
  },
  config = function(_, opts)
    require("nvim-treesitter.configs").setup(opts)
  end,
}
